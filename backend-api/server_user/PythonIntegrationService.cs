namespace WebDeepFence.Services
{
    public class PythonIntegrationService
    {
        private readonly HttpClient _httpClient;
        // Python AI server (Flask)
        private readonly string _pythonServerUrl = "http://127.0.0.1:5000/api/scan-image";

        public PythonIntegrationService(HttpClient httpClient)
        {
            _httpClient = httpClient;
        }

        public async Task<string> SendImageToPythonAsync(IFormFile imageFile)
        {
            using var form = new MultipartFormDataContent();

            using var stream = imageFile.OpenReadStream();
            var fileContent = new StreamContent(stream);
            fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(imageFile.ContentType);

            // Field name must match request.files['file'] in the Python server
            form.Add(fileContent, "file", imageFile.FileName);

            var response = await _httpClient.PostAsync(_pythonServerUrl, form);

            var resultString = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                throw new Exception(resultString);
            }

            return resultString;
        }
    }
}

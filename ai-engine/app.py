import concurrent.futures
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import numpy as np
import cv2
import io
import tensorflow as tf
import keras

import torch
import torch.nn as nn
import torchvision.models as models
import torchvision.transforms as transforms
from torchvision.models import vit_b_16

from mtcnn import MTCNN

print("--- Loading MTCNN face detector... ---")
face_detector = MTCNN()

app = Flask(__name__)
CORS(app)

# ==========================================
# 1. Model loading
# ==========================================
print("--- Loading models into memory, please wait... ---")

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Model 1: EfficientNet-B4 (TensorFlow) - general visual patterns and textures
TF_MODEL_PATH = 'EfficientNet_B4_model.keras'
try:
    tf_model = keras.models.load_model(TF_MODEL_PATH)
    print("[V] Model 1 (EfficientNet-B4) loaded")
except Exception as e:
    print(f"[X] Failed to load model 1 (EfficientNet-B4): {e}")
    tf_model = None

# Model 2: Vision Transformer ViT-B/16 (PyTorch) - global relations between image regions
VIT_MODEL_PATH = 'best_vit_fake_detection.pth'
try:
    vit_model = vit_b_16(weights=None)
    vit_model.heads.head = nn.Linear(vit_model.heads.head.in_features, 2)
    vit_model.load_state_dict(torch.load(VIT_MODEL_PATH, map_location=DEVICE))
    vit_model.to(DEVICE)
    vit_model.eval()

    vit_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    print("[V] Model 2 (ViT) loaded")
except Exception as e:
    print(f"[X] Failed to load model 2 (ViT): {e}")
    vit_model = None

# Model 3: EfficientNet-B0 on DCT (PyTorch) - frequency-domain artifacts
DCT_MODEL_PATH = 'best_dct_model_final.pth'
# Normalization statistics computed on the training set
GLOBAL_MEAN = [-4.6428, -4.6428, -4.6428]
GLOBAL_STD = [1.5857, 1.5857, 1.5857]

def compute_dct_from_array(img_array):
    img_float = np.float32(img_array) / 255.0
    dct_result = cv2.dct(img_float)
    dct_log = np.log(np.abs(dct_result) + 1e-8)
    dct_tensor = torch.tensor(dct_log, dtype=torch.float32).unsqueeze(0)
    dct_tensor = dct_tensor.repeat(3, 1, 1)
    return dct_tensor

try:
    dct_model = models.efficientnet_b0(weights=None)
    in_features = dct_model.classifier[1].in_features
    dct_model.classifier[1] = nn.Linear(in_features, 1)
    dct_model.load_state_dict(torch.load(DCT_MODEL_PATH, map_location=DEVICE))
    dct_model.to(DEVICE)
    dct_model.eval()

    dct_normalize = transforms.Normalize(mean=GLOBAL_MEAN, std=GLOBAL_STD)
    print("[V] Model 3 (DCT) loaded")
except Exception as e:
    print(f"[X] Failed to load model 3 (DCT): {e}")
    dct_model = None

# ==========================================
# 2. Helper and analysis functions
# ==========================================

def check_high_frequency_energy(img):
    """
    Measures the average energy in the high-frequency region of the DCT.
    Heavily compressed (e.g. WhatsApp) or blurred images return a low value,
    which lets the ensemble ignore the DCT model and avoid false positives.
    """
    img_gray = np.array(img.convert('L'))
    img_float = np.float32(img_gray) / 255.0
    dct_result = cv2.dct(img_float)

    h, w = dct_result.shape
    high_freq_region = dct_result[h//2:, w//2:]

    energy = np.mean(np.abs(high_freq_region))
    return energy

def analyze_with_tf(img):
    if tf_model is None: return {"error": "Model not loaded"}
    img_resized = img.resize((380, 380))
    img_array = keras.utils.img_to_array(img_resized)
    img_array = np.expand_dims(img_array, axis=0)

    prediction = tf_model.predict(img_array, verbose=0)
    score = float(prediction[0][0])

    if score > 0.5:
        return {"result": "Real", "confidence": round(score * 100, 2)}
    else:
        return {"result": "Fake", "confidence": round((1 - score) * 100, 2)}

def analyze_with_vit(img):
    if vit_model is None: return {"error": "Model not loaded"}
    input_tensor = vit_transform(img).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        outputs = vit_model(input_tensor)
        probabilities = torch.nn.functional.softmax(outputs[0], dim=0)

    predicted_idx = torch.argmax(probabilities).item()
    confidence = probabilities[predicted_idx].item() * 100

    result_class = "Real" if predicted_idx == 1 else "Fake"
    return {"result": result_class, "confidence": round(confidence, 2)}

def analyze_with_dct(img):
    if dct_model is None: return {"error": "Model not loaded"}
    img_gray = img.convert('L')
    img_array = np.array(img_gray)
    img_resized = cv2.resize(img_array, (224, 224))

    dct_tensor = compute_dct_from_array(img_resized)
    dct_tensor = dct_normalize(dct_tensor)
    input_tensor = dct_tensor.unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        output = dct_model(input_tensor).squeeze(1)
        probability = torch.sigmoid(output).item()

    if probability >= 0.5:
        return {"result": "Fake", "confidence": round(probability * 100, 2)}
    else:
        return {"result": "Real", "confidence": round((1 - probability) * 100, 2)}

def get_cropped_face(img, margin=0.2):
    """
    Detects the most confident face and crops it with a margin, to remove background noise.
    """
    if img.width < 50 or img.height < 50:
        return None

    img_array = np.array(img)

    try:
        faces = face_detector.detect_faces(img_array)
    except Exception as e:
        print(f"MTCNN skipped a corrupted/empty face evaluation: {e}")
        return None

    if not faces:
        return None

    best_face = max(faces, key=lambda f: f['confidence'])
    x, y, w, h = best_face['box']

    margin_x = int(w * margin)
    margin_y = int(h * margin)

    x1 = max(0, x - margin_x)
    y1 = max(0, y - margin_y)
    x2 = min(img_array.shape[1], x + w + margin_x)
    y2 = min(img_array.shape[0], y + h + margin_y)

    cropped_array = img_array[y1:y2, x1:x2]
    return Image.fromarray(cropped_array)

# ==========================================
# 3. API route
# ==========================================

def get_fake_probability(model_result):
    """ Normalizes every model result to a single 'fake probability' scale (0-100). """
    if "error" in model_result: return 50.0
    conf = model_result["confidence"]
    return conf if model_result["result"] == "Fake" else 100.0 - conf

@app.route('/api/scan-image', methods=['POST'])
def scan_image():
    if 'file' not in request.files: return jsonify({"error": "No file was sent"}), 400
    file = request.files['file']
    if file.filename == '': return jsonify({"error": "No file selected"}), 400

    try:
        img_bytes = file.read()
        img = Image.open(io.BytesIO(img_bytes)).convert('RGB')

        cropped_img = get_cropped_face(img)

        if cropped_img is None:
            return jsonify({
                "status": "error",
                "error": "No face detected. Please upload a clearer photo of a person."
            }), 400

        # Run all three models in parallel to reduce response time
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future_tf = executor.submit(analyze_with_tf, cropped_img)
            future_vit = executor.submit(analyze_with_vit, cropped_img)
            future_dct = executor.submit(analyze_with_dct, cropped_img)

            res_tf = future_tf.result()
            res_vit = future_vit.result()
            res_dct = future_dct.result()

        fake_prob_tf = get_fake_probability(res_tf)
        fake_prob_vit = get_fake_probability(res_vit)
        fake_prob_dct = get_fake_probability(res_dct)

        # Dynamic ensemble weights: ignore the DCT model on low-quality (compressed) images
        hf_energy = check_high_frequency_energy(cropped_img)

        if hf_energy < 0.005:
            weight_tf, weight_vit, weight_dct = 0.50, 0.50, 0.00
            quality_note = "Low Quality (Compressed) - DCT ignored (0% weight)"
        else:
            weight_tf, weight_vit, weight_dct = 0.36, 0.36, 0.28
            quality_note = "High Quality - Weighted by accuracy (TF: 36%, ViT: 36%, DCT: 28%)"

        final_fake_prob = (weight_tf * fake_prob_tf) + (weight_vit * fake_prob_vit) + (weight_dct * fake_prob_dct)

        if final_fake_prob >= 50.0:
            final_result = "Fake"
            final_confidence = round(final_fake_prob, 2)
        else:
            final_result = "Real"
            final_confidence = round(100.0 - final_fake_prob, 2)


        if final_confidence == 100.0:
            final_confidence = 99.4

        return jsonify({
            "status": "success",
            "final_decision": {
                "result": final_result,
                "confidence": final_confidence,
                "image_quality": quality_note
            },
            "breakdown": {
                "tensorflow_cnn": res_tf,
                "pytorch_vit": res_vit,
                "frequency_dct": res_dct
            }
        }), 200

    except Exception as e:
        print(f"Server error during prediction: {e}")
        return jsonify({"error": "Internal error while analyzing the image"}), 500

if __name__ == '__main__':
    print("Server is ready on port 5000")
    app.run(debug=True, port=5000)

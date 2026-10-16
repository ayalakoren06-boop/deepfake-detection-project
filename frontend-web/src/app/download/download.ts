import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-download',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './download.html',
  styleUrls: ['./download.css']
})
export class DownloadComponent {

  downloadPlugin() {
    const link = document.createElement('a');
    link.href = '/DeepFence_Extension.zip';
    link.download = 'DeepFence_Extension.zip';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

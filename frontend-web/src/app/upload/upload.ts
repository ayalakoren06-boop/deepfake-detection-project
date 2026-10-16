import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../service';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './upload.html',
  styleUrls: ['./upload.css']
})
export class UploadComponent implements OnInit {
  selectedFile: File | null = null;
  selectedFileUrl: string | null = null;

  isScanning: boolean = false;
  scanComplete: boolean = false;
  scanResultData: any = null;
  errorMessage: string = '';

  maxScans: number = 10;
  usedScans: number = 0;
  outOfScans: boolean = false;
  currentUser: any = null;

  // cdr.detectChanges() is used below to force an immediate screen refresh
  constructor(
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadUserAndCheckQuota();
  }

  loadUserAndCheckQuota() {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      this.currentUser = JSON.parse(savedUser);
      this.maxScans = this.currentUser.maxScans || this.currentUser.MaxScans || 10;
      this.usedScans = this.currentUser.usedScans || this.currentUser.UsedScans || 0;
      this.outOfScans = this.usedScans >= this.maxScans;
    } else {
      this.router.navigate(['/']);
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];

    this.errorMessage = '';
    this.scanComplete = false;
    this.scanResultData = null;
    this.selectedFile = null;
    this.selectedFileUrl = null;

    if (file) {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        this.errorMessage = 'Unsupported file type. Please upload a JPG, PNG or WebP image.';
        event.target.value = '';
        return;
      }

      const maxSizeInBytes = 10 * 1024 * 1024;
      if (file.size > maxSizeInBytes) {
        this.errorMessage = 'The image exceeds the maximum size (10MB). Please upload a smaller image.';
        event.target.value = '';
        return;
      }

      this.selectedFile = file;

      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.selectedFileUrl = e.target.result;
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  startScan() {
    if (!this.currentUser || this.outOfScans || !this.selectedFile) return;

    this.isScanning = true;
    this.scanComplete = false;
    this.scanResultData = null;
    this.errorMessage = '';
    this.cdr.detectChanges();

    const email = this.currentUser.email || this.currentUser.Email;

    this.authService.scanImage(this.selectedFile, email).subscribe({
      next: (serverData: any) => {
        this.isScanning = false;
        this.scanComplete = true;
        this.scanResultData = serverData;

        this.usedScans++;
        this.currentUser.usedScans = this.usedScans;
        this.currentUser.UsedScans = this.usedScans;
        localStorage.setItem('user', JSON.stringify(this.currentUser));
        this.outOfScans = this.usedScans >= this.maxScans;

        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.isScanning = false;

        if (err.status === 403) {
          this.errorMessage = 'Your monthly scan quota is used up.';
          this.outOfScans = true;
        } else {
          this.errorMessage = err.error?.error || 'Internal analysis server error.';
        }

        this.cdr.detectChanges();
      }
    });
  }
}

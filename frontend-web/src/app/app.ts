import { Component, OnInit, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from './service';

declare var google: any;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent implements OnInit, AfterViewInit {
  isLoggedIn: boolean = false;
  user: any = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    const savedUser = localStorage.getItem('user');

    if (savedUser && savedUser !== 'undefined') {
      try {
        this.user = JSON.parse(savedUser);
        this.isLoggedIn = true;
      } catch (error) {
        console.error('Error parsing user data:', error);
        localStorage.removeItem('user');
      }
    } else {
      localStorage.removeItem('user');
    }
  }

  ngAfterViewInit() {
    this.renderGoogleButton();
  }

  renderGoogleButton() {
    const btnElement = document.getElementById('googleBtn');
    if (typeof google !== 'undefined' && btnElement) {
      google.accounts.id.initialize({
        client_id: '346950404145-nqkhcvb548u4r3tlq45fr3bs78culkjd.apps.googleusercontent.com',
        callback: this.handleCredentialResponse.bind(this)
      });
      google.accounts.id.renderButton(
        btnElement,
        { theme: 'outline', size: 'large' }
      );
    } else if (!this.isLoggedIn) {
      setTimeout(() => this.renderGoogleButton(), 100);
    }
  }

  handleCredentialResponse(response: any) {
    if (response.credential) {
      const base64Url = response.credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        window.atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      const googleUser = JSON.parse(jsonPayload);

      this.authService.login({ email: googleUser.email, name: googleUser.name }).subscribe({
        next: (backendResponse) => {
          this.user = backendResponse;
          this.isLoggedIn = true;

          localStorage.setItem('user', JSON.stringify(this.user));
          this.notifyExtension();
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error logging in to backend:', err);
          alert('Could not connect to our server.');
        }
      });
    }
  }

  logout() {
    google.accounts.id.disableAutoSelect();
    this.user = null;
    this.isLoggedIn = false;
    localStorage.removeItem('user');
    this.notifyExtension();
    this.cdr.detectChanges();
    this.renderGoogleButton();
    this.router.navigate(['/']);
  }

  // Tells the browser extension who is logged in (email = null when logged out)
  notifyExtension() {
    const email = this.user?.email || this.user?.Email || null;
    window.postMessage({ type: 'DEEPFENCE_USER', email: email }, window.location.origin);
  }
}

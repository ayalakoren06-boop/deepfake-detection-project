import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Central C# backend API
  private apiUrl = 'https://localhost:7058/api';

  constructor(private http: HttpClient) { }

  login(userData: { email: string, name: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, userData);
  }

  purchaseScans(email: string, amount: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/purchase-scans`, { email, amount });
  }

  scanImage(file: File, email: string): Observable<any> {
    const formData = new FormData();
    formData.append('File', file);
    formData.append('Email', email);

    return this.http.post(`${this.apiUrl}/scan-image`, formData);
  }
}

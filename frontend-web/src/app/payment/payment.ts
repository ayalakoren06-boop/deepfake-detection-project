import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../service';

@Component({
  selector: 'app-payment',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './payment.html',
  styleUrls: ['./payment.css']
})
export class PaymentComponent implements OnInit {
  paymentForm!: FormGroup;
  isProcessing: boolean = false;
  isPaid: boolean = false;
  errorMessage: string = '';
  currentUser: any = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      this.currentUser = JSON.parse(savedUser);
    }

    this.paymentForm = this.fb.group({
      fullName: ['', Validators.required],
      cardNumber: ['', [Validators.required, Validators.pattern('^[0-9]{16}$')]],
      expiry: ['', [Validators.required, Validators.pattern('^(0[1-9]|1[0-2])/?([0-9]{2})$')]],
      cvv: ['', [Validators.required, Validators.pattern('^[0-9]{3,4}$')]]
    });
  }

  onSubmit() {
    if (this.paymentForm.invalid || !this.currentUser) {
      this.paymentForm.markAllAsTouched();
      return;
    }

    this.isProcessing = true;
    this.errorMessage = '';

    const email = this.currentUser.email || this.currentUser.Email;

    // Simulated payment processing delay
    setTimeout(() => {
      this.authService.purchaseScans(email, 99).subscribe({
        next: (res: any) => {
          // The server returns the upgraded user (PRO, 100 scans per month)
          this.currentUser = res.user;
          localStorage.setItem('user', JSON.stringify(this.currentUser));
          this.isProcessing = false;
          this.isPaid = true;
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          this.isProcessing = false;
          this.errorMessage = err.error?.error || 'The payment could not be completed. Please try again later.';
          this.cdr.detectChanges();
        }
      });
    }, 1500);
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit {
  currentUser: any = null;

  maxScans: number = 10;
  usedScans: number = 0;
  remainingScans: number = 10;
  progressPercentage: number = 0;
  isPro: boolean = false;

  constructor(private router: Router) { }

  ngOnInit() {
    this.loadUserData();
  }

  loadUserData() {
    const savedUser = localStorage.getItem('user');

    if (savedUser) {
      this.currentUser = JSON.parse(savedUser);

      this.maxScans = this.currentUser.maxScans || this.currentUser.MaxScans || 10;
      this.usedScans = this.currentUser.usedScans || this.currentUser.UsedScans || 0;

      const status = this.currentUser.status || this.currentUser.Status;
      this.isPro = status === "PRO";

    } else {
      this.usedScans = 0;
    }

    this.calculateRemaining();
  }

  calculateRemaining() {
    this.remainingScans = this.maxScans - this.usedScans;
    if (this.remainingScans < 0) this.remainingScans = 0;

    this.progressPercentage = (this.usedScans / this.maxScans) * 100;
  }

  upgradePlan() {
    this.router.navigate(['/payment']);
  }
}

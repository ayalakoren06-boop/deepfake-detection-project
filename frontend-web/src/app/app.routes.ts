import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard';
import { UploadComponent } from './upload/upload';
import { DownloadComponent } from './download/download';
import { PaymentComponent } from './payment/payment';
import { HomeComponent } from './home/home';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'upload', component: UploadComponent },
  { path: 'download', component: DownloadComponent },
  { path: 'payment', component: PaymentComponent }
];

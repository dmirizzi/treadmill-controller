import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TreadmillService, TreadmillStatus } from './services/treadmill.service';
import {
  trigger,
  transition,
  style,
  animate
} from '@angular/animations';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  animations: [
    trigger('bannerAnim', [
      // Enter: slide down + fade in
      transition(':enter', [
        style({
          opacity: 0,
          transform: 'translateY(-12px)'
        }),
        animate(
          '220ms cubic-bezier(0.22, 0.61, 0.36, 1)',
          style({
            opacity: 1,
            transform: 'translateY(0)'
          })
        )
      ]),
      // Leave: slight lift + fade out
      transition(':leave', [
        animate(
          '180ms cubic-bezier(0.4, 0.0, 0.2, 1)',
          style({
            opacity: 0,
            transform: 'translateY(-8px)'
          })
        )
      ])
    ])
  ]  
})
export class AppComponent implements OnInit {
  title = 'Treadmill';
  status: TreadmillStatus | null = null;
  speedInput = 2.0;

  isConnecting = false;
  isSendingCommand = false;

  // Banner state
  bannerVisible = false;
  bannerMessage = '';
  bannerType: 'info' | 'error' = 'info';
  private bannerTimeoutId: any = null;  

  constructor(private treadmill: TreadmillService) {
    this.refresh();
  }

  ngOnInit(): void {
    this.treadmill.connectToEvents();

    this.treadmill.status$.subscribe(status => {
      if (status) {
        this.status = status;
      }
    });
  }

  get isConnected(): boolean {
    return !!this.status?.isConnected;
  }

  get isRunning(): boolean {
    return !!this.status?.isRunning;
  }

  refresh(): void {
    this.treadmill.getStatus().subscribe(s => {
      this.status = s;
      if (s.isConnected) {
        this.speedInput = s.currentSpeedKmh;
      }
    });
  }

  onConnect(): void {
    if (this.isConnecting || this.isConnected) return;
    this.isConnecting = true;

    this.treadmill.connect().subscribe({
      next: s => {
        this.status = s;
        if (s.isConnected) {
          this.speedInput = s.currentSpeedKmh || this.speedInput;
        }
      },
      error: err => {
        console.error('Connect failed', err);
        this.isConnecting = false;
        this.showErrorBanner('Unable to connect to treadmill. Make sure it is on and nearby.');
      },
      complete: () => {
        this.isConnecting = false;
      }
    });
  }

  onStart(): void {
    if (!this.isConnected || this.isSendingCommand) return;
    this.isSendingCommand = true;

    this.treadmill.start().subscribe({
      next: s => this.status = s,
      error: err => console.error('Start failed', err),
      complete: () => this.isSendingCommand = false
    });
  }

  onStop(): void {
    if (!this.isConnected || this.isSendingCommand) return;
    this.isSendingCommand = true;

    this.treadmill.stop().subscribe({
      next: s => this.status = s,
      error: err => console.error('Stop failed', err),
      complete: () => this.isSendingCommand = false
    });
  }

  onChangeSpeed(delta: number): void {

    if (!this.isConnected || this.isSendingCommand) return;
    this.isSendingCommand = true;

    const current = this.status?.currentSpeedKmh ?? this.speedInput ?? 0;
    this.treadmill.setSpeed(current + delta).subscribe({
      next: s => this.status = s,
      error: err => console.error('Set speed failed', err),
      complete: () => this.isSendingCommand = false
    });    
  }

  onSetSpeed(): void {
    if (!this.isConnected || this.isSendingCommand) return;
    this.isSendingCommand = true;

    this.treadmill.setSpeed(this.speedInput).subscribe({
      next: s => this.status = s,
      error: err => console.error('Set speed failed', err),
      complete: () => this.isSendingCommand = false
    });
  }

  private showBanner(
    message: string,
    type: 'info' | 'error' = 'info',
    durationMs = 3000
  ): void {
    this.bannerMessage = message;
    this.bannerType = type;
    this.bannerVisible = true;

    // Reset previous timeout if one exists
    if (this.bannerTimeoutId) {
      clearTimeout(this.bannerTimeoutId);
    }

    this.bannerTimeoutId = setTimeout(() => {
      this.bannerVisible = false;
      this.bannerTimeoutId = null;
    }, durationMs);
  }

  private showErrorBanner(message: string): void {
    this.showBanner(message, 'error');
  }  

  formatTime(seconds: number | undefined): string {
    if (seconds == null) return '00:00';
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;

    if (h > 0) {
      return `${this.pad(h)}:${this.pad(m)}:${this.pad(sec)}`;
    }
    return `${this.pad(m)}:${this.pad(sec)}`;
  }

  private pad(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TreadmillService, TreadmillStatus } from './services/treadmill.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'Treadmill';
  status: TreadmillStatus | null = null;
  speedInput = 2.0;

  isConnecting = false;
  isSendingCommand = false;

  constructor(private treadmill: TreadmillService) {
    this.refresh();
  }

  ngOnInit(): void {
    this.treadmill.connectToEvents();

    this.treadmill.status$.subscribe(status => {
      if (status) {
        this.status = status;

        if (status.isConnected) {
          this.speedInput = status.currentSpeedKmh;
        }
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

  onSetSpeed(): void {
    if (!this.isConnected || this.isSendingCommand) return;
    this.isSendingCommand = true;

    this.treadmill.setSpeed(this.speedInput).subscribe({
      next: s => this.status = s,
      error: err => console.error('Set speed failed', err),
      complete: () => this.isSendingCommand = false
    });
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

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

type HiitPresetId = 'beginner' | 'classic' | 'custom';

interface HiitSegment {
  label: string;      // e.g. 'Warmup', 'High', 'Recover', 'Cooldown'
  durationSec: number;
  speedKmh: number;
}

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
  viewMode: 'manual' | 'hiit' = 'manual';

  status: TreadmillStatus | null = null;
  speedInput = 2.0;

  isConnecting = false;
  isSendingCommand = false;

  // Theme
  themeMode: 'light' | 'dark' = 'light';

  // Banner state
  bannerVisible = false;
  bannerMessage = '';
  bannerType: 'info' | 'error' = 'info';
  private bannerTimeoutId: any = null;  

  // ---- HIIT view state ----
  selectedHiitPreset: HiitPresetId = 'beginner';
  hiitDescription = 'Beginner intervals with gentle warmup and cooldown.';

  isHiitRunning = false;
  hiitSegments: HiitSegment[] = [];
  hiitCurrentIndex = 0;
  hiitRemainingSeconds = 0;
  hiitTotalSegments = 0;

  hiitCurrentSpeedKmh = 0;
  hiitNextSpeedKmh: number | null = null;
  currentPhaseLabel = 'Ready';

  private hiitTimerId: any = null;

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

  toggleTheme(): void {
    this.themeMode = this.themeMode === 'light' ? 'dark' : 'light';
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
      error: err => {
        console.error('Start failed', err);
        this.showErrorBanner('Could not start treadmill.');
        this.isSendingCommand = false;
      },
      complete: () => {
        this.isSendingCommand = false;
      }
    });
  }

  onStop(): void {
    if (!this.isConnected || this.isSendingCommand) return;
    this.isSendingCommand = true;

    this.treadmill.stop().subscribe({
      next: s => this.status = s,
      error: err => {
        console.error('Stop failed', err);
        this.showErrorBanner('Could not stop treadmill.');
        this.isSendingCommand = false;
      },
      complete: () => {
        this.isSendingCommand = false;
      }
    });
  }

  onChangeSpeed(delta: number): void {
    if (!this.isConnected || this.isSendingCommand) return;
    this.isSendingCommand = true;

    const current = this.status?.currentSpeedKmh ?? this.speedInput ?? 0;
    this.treadmill.setSpeed(current + delta).subscribe({
      next: s => this.status = s,
      error: err => {
        console.error('Set speed (delta) failed', err);
        this.showErrorBanner('Could not adjust speed.');
        this.isSendingCommand = false;
      },
      complete: () => {
        this.isSendingCommand = false;
      }
    });
  }

  onSetSpeed(): void {
    if (!this.isConnected || this.isSendingCommand) return;
    this.isSendingCommand = true;

    this.treadmill.setSpeed(this.speedInput).subscribe({
      next: s => this.status = s,
      error: err => {
        console.error('Set speed failed', err);
        this.showErrorBanner('Could not set speed.');
        this.isSendingCommand = false;
      },
      complete: () => {
        this.isSendingCommand = false;
      }
    });
  }

  onShortcutSpeed(value: number): void {
    // update local input and apply immediately when connected
    this.speedInput = value;
    if (!this.isConnected || this.isSendingCommand) return;
    this.onSetSpeed();
  }

  selectHiitPreset(preset: HiitPresetId): void {
    if (this.isHiitRunning) {
      // Optional: prevent changing preset mid-workout
      this.showBanner('Finish current HIIT before changing preset.', 'info', 2500);
      return;
    }

    this.selectedHiitPreset = preset;

    switch (preset) {
      case 'beginner':
        this.hiitDescription = 'Beginner intervals with gentle warmup and cooldown.';
        break;
      case 'classic':
        this.hiitDescription = '6× 1 min high / 1 min easy, plus warmup and cooldown.';
        break;
      case 'custom':
        this.hiitDescription = 'Custom intervals. (Configure in settings later.)';
        break;
    }
  }

  onHiitStart(): void {
    if (!this.isConnected) {
      this.showErrorBanner('Connect to your treadmill to start HIIT.');
      return;
    }
    if (this.isHiitRunning) return;

    this.hiitSegments = this.buildHiitSegments(this.selectedHiitPreset);
    if (!this.hiitSegments.length) {
      this.showErrorBanner('No HIIT segments configured.');
      return;
    }

    this.isHiitRunning = true;
    this.currentPhaseLabel = 'Starting';
    this.clearHiitTimer();

    // Start first segment
    this.startHiitSegment(0);

    // 1-second timer
    this.hiitTimerId = setInterval(() => this.tickHiit(), 1000);
  }

  onHiitStop(): void {
    if (!this.isHiitRunning) return;

    this.clearHiitTimer();
    this.isHiitRunning = false;
    this.currentPhaseLabel = 'Stopped';
    this.hiitRemainingSeconds = 0;
    this.hiitNextSpeedKmh = null;

    if (this.isConnected) {
      this.isSendingCommand = true;
      this.treadmill.stop().subscribe({
        next: s => (this.status = s),
        error: err => {
          console.error('HIIT stop failed', err);
          this.showErrorBanner('Could not stop treadmill.');
          this.isSendingCommand = false;
        },
        complete: () => {
          this.isSendingCommand = false;
        }
      });
    }
  }

  // Map preset to segments. You can tweak speeds/durations.
  private buildHiitSegments(preset: HiitPresetId): HiitSegment[] {
    switch (preset) {
      case 'beginner':
        return [
          { label: 'Warmup',  durationSec: 60, speedKmh: 3.0 },
          { label: 'High',    durationSec: 45,  speedKmh: 5.0 },
          { label: 'Recover', durationSec: 45,  speedKmh: 3.5 },
          { label: 'High',    durationSec: 45,  speedKmh: 5.0 },
          { label: 'Recover', durationSec: 45,  speedKmh: 3.5 },
          { label: 'Cooldown',durationSec: 120, speedKmh: 3.0 },
        ];
      case 'classic':
        return [
          { label: 'Warmup',  durationSec: 60, speedKmh: 3.0 },
          // 6× 1 min high / 1 min easy
          { label: 'High',    durationSec: 60,  speedKmh: 6.0 },
          { label: 'Recover', durationSec: 60,  speedKmh: 3.5 },
          { label: 'High',    durationSec: 60,  speedKmh: 6.0 },
          { label: 'Recover', durationSec: 60,  speedKmh: 3.5 },
          { label: 'High',    durationSec: 60,  speedKmh: 6.0 },
          { label: 'Recover', durationSec: 60,  speedKmh: 3.5 },
          { label: 'High',    durationSec: 60,  speedKmh: 6.0 },
          { label: 'Recover', durationSec: 60,  speedKmh: 3.5 },
          { label: 'High',    durationSec: 60,  speedKmh: 6.0 },
          { label: 'Recover', durationSec: 60,  speedKmh: 3.5 },
          { label: 'High',    durationSec: 60,  speedKmh: 6.0 },
          { label: 'Cooldown',durationSec: 120, speedKmh: 3.0 },
        ];
      case 'custom':
      default:
        // For now, same as classic; later you can build from user config.
        return [
          { label: 'Warmup',  durationSec: 120, speedKmh: 3.0 },
          { label: 'High',    durationSec: 30,  speedKmh: 5.5 },
          { label: 'Recover', durationSec: 30,  speedKmh: 3.5 },
          { label: 'High',    durationSec: 30,  speedKmh: 5.5 },
          { label: 'Recover', durationSec: 30,  speedKmh: 3.5 },
          { label: 'Cooldown',durationSec: 90,  speedKmh: 3.0 },
        ];
    }
  }

  private clearHiitTimer(): void {
    if (this.hiitTimerId != null) {
      clearInterval(this.hiitTimerId);
      this.hiitTimerId = null;
    }
  }

  private startHiitSegment(index: number): void {
    if (!this.status?.isConnected) {
      this.showErrorBanner('Treadmill is not connected.');
      this.isHiitRunning = false;
      this.clearHiitTimer();
      return;
    }

    if (!this.hiitSegments[index]) {
      this.finishHiitWorkout();
      return;
    }

    const segment = this.hiitSegments[index];
    this.hiitCurrentIndex = index;
    this.currentPhaseLabel = segment.label;
    this.hiitCurrentSpeedKmh = segment.speedKmh;
    this.hiitRemainingSeconds = segment.durationSec;
    this.hiitTotalSegments = this.hiitSegments.length;

    const nextSeg = this.hiitSegments[index + 1];
    this.hiitNextSpeedKmh = nextSeg ? nextSeg.speedKmh : null;

    // Apply speed (and start treadmill if needed)
    const applySpeed = () => {
      this.isSendingCommand = true;
      this.treadmill.setSpeed(segment.speedKmh).subscribe({
        next: s => (this.status = s),
        error: err => {
          console.error('HIIT set speed failed', err);
          this.showErrorBanner('Could not set HIIT speed.');
          this.isSendingCommand = false;
          this.finishHiitWorkout();
        },
        complete: () => {
          this.isSendingCommand = false;
        }
      });
    };

    if (!this.isRunning) {
      // Start treadmill first, then apply speed.
      this.isSendingCommand = true;
      this.treadmill.start().subscribe({
        next: s => (this.status = s),
        error: err => {
          console.error('HIIT start failed', err);
          this.showErrorBanner('Could not start HIIT workout.');
          this.isSendingCommand = false;
          this.finishHiitWorkout();
        },
        complete: () => {
          this.isSendingCommand = false;
          applySpeed();
        }
      });
    } else {
      applySpeed();
    }
  }

  private tickHiit(): void {
    if (!this.isHiitRunning) return;

    if (this.hiitRemainingSeconds > 0) {
      this.hiitRemainingSeconds -= 1;
    }

    if (this.hiitRemainingSeconds <= 0) {
      const nextIndex = this.hiitCurrentIndex + 1;
      if (nextIndex >= this.hiitSegments.length) {
        this.finishHiitWorkout();
      } else {
        this.startHiitSegment(nextIndex);
      }
    }
  }

  private finishHiitWorkout(): void {
    this.clearHiitTimer();
    this.isHiitRunning = false;
    this.currentPhaseLabel = 'Done';
    this.hiitRemainingSeconds = 0;
    this.hiitNextSpeedKmh = null;

    // Optional: stop the treadmill at the end
    if (this.isConnected) {
      this.isSendingCommand = true;
      this.treadmill.stop().subscribe({
        next: s => (this.status = s),
        error: err => {
          console.error('Stop after HIIT failed', err);
          this.showErrorBanner('Could not stop treadmill after HIIT.');
          this.isSendingCommand = false;
        },
        complete: () => {
          this.isSendingCommand = false;
        }
      });
    }
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

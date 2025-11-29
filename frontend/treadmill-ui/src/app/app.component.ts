import { Component } from '@angular/core';
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
export class AppComponent {
  title = 'Treadmill UI';
  status: TreadmillStatus | null = null;
  speedInput = 2.0;

  constructor(private treadmill: TreadmillService) {
    this.refresh();
  }

  refresh(): void {
    this.treadmill.getStatus().subscribe(s => this.status = s);
  }

  onConnect(): void {
    this.treadmill.connect().subscribe(s => this.status = s);
  }

  onDisconnect(): void {
    this.treadmill.disconnect().subscribe(s => this.status = s);
  }

  onStart(): void {
    this.treadmill.start().subscribe(s => this.status = s);
  }

  onStop(): void {
    this.treadmill.stop().subscribe(s => this.status = s);
  }

  onSetSpeed(): void {
    this.treadmill.setSpeed(this.speedInput).subscribe(s => this.status = s);
  }
}

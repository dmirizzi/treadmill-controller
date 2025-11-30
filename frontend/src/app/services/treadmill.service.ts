import { Injectable, OnDestroy, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';

export interface TreadmillStatus {
  isConnected: boolean;
  isRunning: boolean;
  currentSpeedKmh: number;
  elapsedTimeSeconds: number;
  burnedCalories: number;
  totalDistanceKm: number;
  minSpeedKmh: number;
  maxSpeedKmh: number;
}

@Injectable({
  providedIn: 'root'
})
export class TreadmillService implements OnDestroy{

  private eventSource?: EventSource;

  private statusSubject = new BehaviorSubject<TreadmillStatus | null>(null);
  status$: Observable<TreadmillStatus | null> = this.statusSubject.asObservable();

  constructor(
    private http: HttpClient,
    private zone: NgZone) {}

  connectToEvents(): void {
    if (this.eventSource) {
      return; // already connected
    }

    // If frontend and backend are same origin (via Docker), relative URL is enough:
    this.eventSource = new EventSource('/api/events');

    this.eventSource.onmessage = (event: MessageEvent) => {
      try {
        console.log('SSE message received', event.data);
        const data = JSON.parse(event.data) as TreadmillStatus;
        
        this.zone.run(() => {
          this.statusSubject.next(data);
        });
      } catch (err) {
        console.error('Failed to parse SSE data', err, event.data);
      }
    };

    this.eventSource.onerror = (err) => {
      console.error('SSE error', err);
      // Optionally auto-reconnect: close and recreate after a timeout
      // this.eventSource?.close();
      // this.eventSource = undefined;
      // setTimeout(() => this.connectToEvents(), 2000);
    };
  }

  ngOnDestroy(): void {
    this.eventSource?.close();
  }

  getStatus(): Observable<TreadmillStatus> {
    return this.http.get<TreadmillStatus>('/api/status');
  }

  connect(): Observable<TreadmillStatus> {
    return this.http.post<TreadmillStatus>('/api/connect', {});
  }

  disconnect(): Observable<TreadmillStatus> {
    return this.http.post<TreadmillStatus>('/api/disconnect', {});
  }

  start(): Observable<TreadmillStatus> {
    return this.http.post<TreadmillStatus>('/api/start', {});
  }

  stop(): Observable<TreadmillStatus> {
    return this.http.post<TreadmillStatus>('/api/stop', {});
  }

  setSpeed(speedKmh: number): Observable<TreadmillStatus> {
    return this.http.post<TreadmillStatus>('/api/speed', { speedKmh });
  }
}

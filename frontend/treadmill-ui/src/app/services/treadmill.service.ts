import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TreadmillStatus {
  isConnected: boolean;
  isRunning: boolean;
  currentSpeedKmh: number;
}

@Injectable({
  providedIn: 'root'
})
export class TreadmillService {
  constructor(private http: HttpClient) {}

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

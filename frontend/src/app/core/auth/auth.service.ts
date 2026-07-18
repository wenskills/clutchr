import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface AuthResponse {
  user_id: number;
  username: string;
  email: string;
  token: string;
  first_name?: string;
  profile_complete?: boolean;
  requires_2fa?: boolean;
  pending_token?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:8000/api/v1';
  private tokenKey = 'auth_token';
  private userKey = 'auth_user';

  private currentUserSubject = new BehaviorSubject<any>(this.getUserFromStorage());
  public currentUser$ = this.currentUserSubject.asObservable();

  private isAuthenticatedSubject = new BehaviorSubject<boolean>(this.hasToken());
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  constructor(private http: HttpClient) {}

  register(username: string, email: string, password: string, firstName = '', lastName = ''): Observable<AuthResponse> {
    const body = {
      username, email, password,
      password_confirm: password,
      first_name: firstName,
      last_name: lastName
    };
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register/`, body).pipe(
      tap(response => this.handleAuthResponse(response))
    );
  }

  login(username: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login/`, { username, password }).pipe(
      tap(response => this.handleAuthResponse(response))
    );
  }

  confirmTwoFactorLogin(pendingToken: string, code: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/2fa-login/`, {
      pending_token: pendingToken, code
    }).pipe(
      tap(response => this.handleAuthResponse(response))
    );
  }

  /**
   * Connexion via Google Identity Services.
   */
  loginWithGoogle(idToken: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/google/`, { id_token: idToken }).pipe(
      tap(response => this.handleAuthResponse(response))
    );
  }

  requestPasswordReset(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/auth/password-reset/`, { email });
  }

  confirmPasswordReset(uid: string, token: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/auth/password-reset-confirm/`, {
      uid, token, new_password: newPassword
    });
  }

  logout(): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/logout/`, {}).pipe(
      tap(() => this.clearAuth())
    );
  }

  private handleAuthResponse(response: AuthResponse) {
    if (response.token) {
      localStorage.setItem(this.tokenKey, response.token);
      localStorage.setItem(this.userKey, JSON.stringify({
        user_id: response.user_id,
        username: response.username,
        email: response.email,
        first_name: response.first_name,
        profile_complete: response.profile_complete
      }));
      this.currentUserSubject.next(response);
      this.isAuthenticatedSubject.next(true);
    }
  }

  private clearAuth() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.currentUserSubject.next(null);
    this.isAuthenticatedSubject.next(false);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  private hasToken(): boolean {
    return !!this.getToken();
  }

  private getUserFromStorage(): any {
    const userJson = localStorage.getItem(this.userKey);
    return userJson ? JSON.parse(userJson) : null;
  }

  getCurrentUser(): any {
    return this.currentUserSubject.value;
  }

  isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value;
  }

  /** Traduit les erreurs API courantes en français lisible. */
  static extractErrorMessage(err: any): string {
    const data = err?.error;
    if (!data) return 'Une erreur est survenue. Veuillez réessayer.';
    if (typeof data === 'string') return data;
    if (data.error) return data.error;
    if (data.detail) return data.detail;
    const firstKey = Object.keys(data)[0];
    if (firstKey) {
      const val = data[firstKey];
      return Array.isArray(val) ? val[0] : String(val);
    }
    return 'Une erreur est survenue. Veuillez réessayer.';
  }
}

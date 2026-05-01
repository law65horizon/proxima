import { Pool } from "pg";

export type UserRole = 'renter' | 'agent' | 'owner' | 'admin';

export interface Context {
  user: AuthUser
  auth_msg?: string
  db?: Pool
  // session
}

export type Recents ={
  userId: number;
  tag: string;
  postal_code?: number,
  city?: string;
  latitude?: number,
  longitude?: number
}

export type Unit = {
  id: number;
  roomTypeId: string;
  unitCode?: string;
  floorNumber?: number;
  status?: string;
};

export type RateCalendar = {
  date: string;
  nightly_rate: number;
  min_stay: number;
  is_blocked: boolean;
};

// User
export interface AuthUser {
  id: string;         // UUID
  email: string;
  role: UserRole;
  sessionId: string
}

export interface User {
  id: string;           // UUID
  name: string;
  uid: string;
  email: string;
  password: string;
  phone?: string;
  description?: string;
  address_id?: number;
  role: UserRole;
  created_at?: string;
  address?: Address;
}

// Address
export interface Address {
    id: number;
    street: string;
    city: string;
    postal_code?: string;
    country: string;
    latitude?: number;
    longitude?: number;
}

// Booking
export interface Booking {
  id: number
  unit: Unit
  guest: User
  guest_id?: number
  checkIn: Date
  checkOut: Date
  totalPrice: number
  currency?: string  
  status: string
  source?: string
  createdAt?: string
}

export interface HostBookingsSummary {
  pending_count?: number
  upcoming_count?: number
  active_count?: number
  completed?: number
  total: number
}

export interface BookingResult {
  success: boolean;
  message: string;
  booking: Booking | null;
  errors: string[];
}

// Messages
export interface Message {
  id: number;
  chat_id: string;
  sender_id: number;
  content: string;
  created_at: string;
}

// Review
export interface Review {
  id: number;
  property_id: number;
  guest_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}
export interface SearchBookingInput {
  query?: string // guest name, email, booking id, property name
  startDate?: Date
  endDate?: Date
  status?: 'pending' | 'confirmed' | 'active'
  guestType?: 'all' | 'repeated' | 'first_time'
  minPrice?: number
  maxPrice?: number
}

export interface BookingInput {
  guestId: number
  checkIn: Date
  checkOut: Date
  roomTypeId: number
  guestCount: number, 
  specialRequests?: string
  source: string
}

// Property && Roomtypes
export interface SearchRoomsInput {
  propertyType?: string[];
  sale_status?: 'rent' | 'sale'
  beds?: number;
  bathrooms?: number;
  minPrice?: number;
  maxPrice?: number;
  minSize?: number;
  maxSize?: number;
  amenities?: string[];
  query?: string;
  value?: string;
  checkIn?: Date;
  checkOut?: Date;
  first?: number;
  after?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
}

export interface ImagesInput {
  storage_key: string
  uri: string
  fileName: string
  mimeType: string
  width?: number
  height?: number
  fileSize: number
}

export interface ImageManageMentInput {
  add: ImagesInput[],
  remove: string[]
  update: any[]
}

export interface ReviewInput {
  bookingId: number;
  user_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}
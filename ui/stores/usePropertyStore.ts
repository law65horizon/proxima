import { AddressDetails } from "@/types/type";
import { create } from "zustand";

export type ImageProps = {
  storage_key?: string;
  cdn_url?: string;
  id?: string; // was number — GraphQL ID is always string
  uri: string;
  fileSize?: number;
  width?: number;
  height?: number;
  fileName?: string;
  mimeType?: string;
};

type FieldOptions =
  | "basicInfo"
  | "address"
  | "photos"
  | "pricing"
  | "description"
  | "mode"
  | "snapshot";

export type PropertyType = "apartment" | "house" | "hotel";
export type ListingType = "sale" | "rent";

export type BasicInfo = {
  propertyType: PropertyType;
  listingType: ListingType;
  title: string;
  speciality?: string;
};

export type DescriptionData = {
  description: string;
  amenities: string[];
};

export type Snapshot = {
  propertyId: string; // was number
  basicInfo: BasicInfo;
  address: AddressDetails;
  description: DescriptionData;
  photos: ImageProps[];
  pricing: string;
};

type FormState = {
  basicInfo: BasicInfo | null;
  address: AddressDetails | null;
  description: DescriptionData | null;
  photos: ImageProps[];
  pricing: string;
  mode: "create" | "edit";
  snapshot: Snapshot | null;

  setField: (field: FieldOptions, value: any) => void;
  resetForm: () => void;
};

export const usePropertyStore = create<FormState>((set) => ({
  basicInfo: null,
  address: null,
  description: null,
  photos: [],
  pricing: "",
  mode: "create",
  snapshot: null,

  setField: (field, value) =>
    set((state) => ({ ...state, [field]: value })),

  resetForm: () =>
    set({
      basicInfo: null,
      address: null,
      description: null,
      photos: [],
      pricing: "",
      mode: "create",
      snapshot: null,
    }),
}));
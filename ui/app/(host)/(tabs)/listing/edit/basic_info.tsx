// listing/edit/basic_info.tsx
import { BasicInfo, PropertyType, usePropertyStore } from "@/stores/usePropertyStore";
import { useTheme } from "@/theme/theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type SaleStatus = "rent" | "sale";

const PROPERTY_TYPES: {
  type: PropertyType;
  icon: string;
  title: string;
  description: string;
  supportsRooms: boolean;
}[] = [
  {
    type: "apartment",
    icon: "business",
    title: "Apartment",
    description: "Multi-unit residential building",
    supportsRooms: true,
  },
  {
    type: "house",
    icon: "home",
    title: "House",
    description: "Single-family residence",
    supportsRooms: false,
  },
  {
    type: "hotel",
    icon: "bed",
    title: "Hotel",
    description: "Commercial accommodation",
    supportsRooms: true,
  },
];

// Apartment & hotel pricing lives on room types — skip the pricing step
export function requiresPricingStep(type: PropertyType | null, listing: SaleStatus) {
  if (!type) return false;
  if (type === "apartment" || type === "hotel") return false; // room-type pricing
  return true; // house always has a direct price
}

export default function BasicInfoScreen() {
  const { theme } = useTheme();
  const basicInfo = usePropertyStore((s) => s.basicInfo);
  const setField = usePropertyStore((s) => s.setField);

  const [propertyType, setPropertyType] = useState<PropertyType | null>(
    basicInfo?.propertyType ?? null
  );
  const [saleStatus, setSaleStatus] = useState<SaleStatus>(
    basicInfo?.listingType ?? "rent"
  );
  const [title, setTitle] = useState(basicInfo?.title ?? "");
  const [speciality, setSpeciality] = useState(basicInfo?.speciality ?? "");

  const validate = () => {
    if (!propertyType) {
      Alert.alert("Missing Information", "Please select a property type");
      return false;
    }
    if (!title.trim()) {
      Alert.alert("Missing Information", "Please enter a property title");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (!validate()) return;

    const data: BasicInfo = { propertyType: propertyType!, listingType: saleStatus, title, speciality };
    setField("basicInfo", data);

    router.push("/listing/edit/location");
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.headerStep, { color: theme.colors.textSecondary }]}>Step 1 of 5</Text>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Basic Information</Text>
        </View>
      </View>

      <ProgressBar pct="20%" colors={theme.colors} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Property Type */}
        <Section title="Property Type" subtitle="Choose the type of property you want to list">
          <View style={styles.typeGrid}>
            {PROPERTY_TYPES.map((item) => {
              const selected = propertyType === item.type;
              return (
                <TouchableOpacity
                  key={item.type}
                  style={[
                    styles.typeCard,
                    { backgroundColor: theme.colors.card },
                    selected && {
                      backgroundColor: theme.colors.primary + "15",
                      borderColor: theme.colors.primary,
                      borderWidth: 2,
                    },
                  ]}
                  onPress={() => setPropertyType(item.type)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={32}
                    color={selected ? theme.colors.primary : theme.colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.typeTitle,
                      { color: selected ? theme.colors.primary : theme.colors.text },
                      selected && { fontWeight: "700" },
                    ]}
                  >
                    {item.title}
                  </Text>
                  <Text style={[styles.typeDesc, { color: theme.colors.textSecondary }]}>
                    {item.description}
                  </Text>
                  {item.supportsRooms && (
                    <View style={[styles.roomBadge, { backgroundColor: theme.colors.backgroundSec }]}>
                      <Ionicons name="bed-outline" size={12} color={theme.colors.primary} />
                      <Text style={[styles.roomBadgeText, { color: theme.colors.textSecondary }]}>
                        Room Types
                      </Text>
                    </View>
                  )}
                  {/* Pricing note */}
                  {item.supportsRooms && (
                    <Text style={[styles.pricingNote, { color: theme.colors.textSecondary }]}>
                      Pricing set per room type
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        {/* Listing Type */}
        <Section title="Listing Type">
          <View style={styles.saleTypeRow}>
            {(["rent", "sale"] as SaleStatus[]).map((s) => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.saleBtn,
                  { backgroundColor: theme.colors.card },
                  saleStatus === s && { backgroundColor: theme.colors.primary },
                ]}
                onPress={() => setSaleStatus(s)}
              >
                <Ionicons
                  name={s === "rent" ? "key-outline" : "pricetag-outline"}
                  size={20}
                  color={saleStatus === s ? "#fff" : theme.colors.text}
                />
                <Text
                  style={[
                    styles.saleBtnText,
                    { color: saleStatus === s ? "#fff" : theme.colors.text },
                  ]}
                >
                  {s === "rent" ? "For Rent" : "For Sale"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* Property Details */}
        <Section title="Property Details">
          <InputField label="Property Title *" theme={theme}>
            <TextInput
              style={[styles.input, { backgroundColor: theme.colors.backgroundInput, color: theme.colors.text }]}
              placeholder="e.g., Modern Downtown Apartment"
              placeholderTextColor={theme.colors.textPlaceholder}
              value={title}
              onChangeText={setTitle}
            />
          </InputField>
          <InputField label="Speciality (Optional)" theme={theme}>
            <TextInput
              style={[styles.input, { backgroundColor: theme.colors.backgroundInput, color: theme.colors.text }]}
              placeholder="e.g., Luxury, Budget-Friendly, Pet-Friendly"
              placeholderTextColor={theme.colors.textPlaceholder}
              value={speciality}
              onChangeText={setSpeciality}
            />
          </InputField>
        </Section>

        {/* Pricing note for room-type properties */}
        {propertyType && (propertyType === "apartment" || propertyType === "hotel") && (
          <View style={[styles.infoBox, { backgroundColor: theme.colors.primary + "12" }]}>
            <Ionicons name="information-circle-outline" size={20} color={theme.colors.primary} />
            <Text style={[styles.infoBoxText, { color: theme.colors.text }]}>
              Pricing for {propertyType === "apartment" ? "apartments" : "hotels"} is set individually per room type after the property is created.
            </Text>
          </View>
        )}
      </ScrollView>

      <BottomNav onBack={() => router.back()} onNext={handleNext} isFirst theme={theme} />
    </KeyboardAvoidingView>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

export function ProgressBar({ pct, colors }: { pct: string; colors: any }) {
  return (
    <View style={[sharedStyles.progressContainer, { backgroundColor: colors.backgroundSec }]}>
      <View style={[sharedStyles.progressBar, { backgroundColor: colors.primary, }]} />
    </View>
  );
}

export function Section({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={sharedStyles.section}>
      {title && <Text style={sharedStyles.sectionTitle}>{title}</Text>}
      {subtitle && <Text style={sharedStyles.sectionSubtitle}>{subtitle}</Text>}
      {children}
    </View>
  );
}

export function InputField({
  label,
  children,
  theme,
}: {
  label: string;
  children: React.ReactNode;
  theme: any;
}) {
  return (
    <View style={sharedStyles.inputGroup}>
      <Text style={[sharedStyles.inputLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      {children}
    </View>
  );
}

export function BottomNav({
  onBack,
  onNext,
  isFirst,
  nextLabel = "Continue",
  nextDisabled,
  theme,
}: {
  onBack: () => void;
  onNext: () => void;
  isFirst?: boolean;
  nextLabel?: string;
  nextDisabled?: boolean;
  theme: any;
}) {
  return (
    <View style={[sharedStyles.bottomNav, { backgroundColor: theme.colors.background }]}>
      {!isFirst && (
        <TouchableOpacity
          style={[sharedStyles.backNavBtn, { backgroundColor: theme.colors.card }]}
          onPress={onBack}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
          <Text style={[sharedStyles.backNavText, { color: theme.colors.text }]}>Back</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[
          sharedStyles.nextBtn,
          { backgroundColor: theme.colors.primary },
          isFirst && { flex: 1 },
          nextDisabled && { opacity: 0.5 },
        ]}
        onPress={onNext}
        activeOpacity={0.8}
        disabled={nextDisabled}
      >
        <Text style={sharedStyles.nextBtnText}>{nextLabel}</Text>
        <Ionicons name="arrow-forward" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  headerContent: { flex: 1 },
  headerStep: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  headerTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 120 },

  typeGrid: { gap: 12 },
  typeCard: {
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  typeTitle: { fontSize: 17, fontWeight: "600", marginTop: 10, marginBottom: 3 },
  typeDesc: { fontSize: 13, textAlign: "center" },
  roomBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roomBadgeText: { fontSize: 11, fontWeight: "600" },
  pricingNote: { fontSize: 11, marginTop: 4, opacity: 0.7 },

  saleTypeRow: { flexDirection: "row", gap: 12 },
  saleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  saleBtnText: { fontSize: 15, fontWeight: "600" },

  input: { height: 50, borderRadius: 12, paddingHorizontal: 16, fontSize: 15 },

  infoBox: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 12, marginTop: -8, marginBottom: 24 },
  infoBoxText: { flex: 1, fontSize: 13, lineHeight: 19 },
});

export const sharedStyles = StyleSheet.create({
  progressContainer: { height: 4, marginHorizontal: 20, borderRadius: 2, overflow: "hidden" },
  progressBar: { height: "100%", borderRadius: 2 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 20, fontWeight: "700", marginBottom: 6, color: "#1A1A1A" },
  sectionSubtitle: { fontSize: 14, marginBottom: 16, lineHeight: 20, color: "#6B7280" },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 12, fontWeight: "600", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 12,
    padding: 20,
    paddingBottom: 30,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  backNavBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  backNavText: { fontSize: 16, fontWeight: "600" },
  nextBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  nextBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/theme/theme';
import { gql, useMutation } from '@apollo/client';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

// ─── GraphQL ────────────────────────────────────────────────────────────────

const REGISTER_AGENT = gql`
  mutation RegisterAgentProfile($input: RegisterAgentInput!) {
    registerAgentProfile(input: $input) {
      success
      message
    }
  }
`;

// ─── Types ───────────────────────────────────────────────────────────────────

type IDType = 'NIN' | 'PASSPORT' | 'DRIVERS_LICENSE' | 'VOTERS_CARD';

const ID_TYPE_OPTIONS: { label: string; value: IDType }[] = [
  { label: "NIN (National ID)", value: 'NIN' },
  { label: "International Passport", value: 'PASSPORT' },
  { label: "Driver's License", value: 'DRIVERS_LICENSE' },
  { label: "Voter's Card", value: 'VOTERS_CARD' },
];

const CAC_REGEX = /^(RC|BN|IT)\d{5,8}$/i;

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ icon, label, colors }: { icon: React.ReactNode; label: string; colors: any }) {
  return (
    <View style={styles.sectionHeader}>
      {icon}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

function Field({
  label,
  children,
  error,
  colors,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  colors: any;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      {children}
      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={13} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

function StyledInput({
  placeholder,
  value,
  onChangeText,
  keyboardType,
  hasError,
  colors,
  ...rest
}: any) {
  const [focused, setFocused] = useState(false);
  const borderColor = hasError
    ? colors.error
    : focused
    ? colors.primary
    : colors.border;

  return (
    <TextInput
      style={[
        styles.input,
        {
          borderColor,
          backgroundColor: colors.backgroundInput,
          color: colors.text,
        },
      ]}
      placeholder={placeholder}
      placeholderTextColor={colors.textPlaceholder}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...rest}
    />
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function UnboardAgentScreen() {
  const { theme } = useTheme();
  const { colors } = theme;
  const navigation = useNavigation() 

  // Address
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const switchMode = useAuthStore((state) => state.switchMode)

  // Agent info
  const [agencyName, setAgencyName] = useState('');
  const [cacNumber, setCacNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [yearsExp, setYearsExp] = useState('');

  // Identity
  const [idType, setIdType] = useState<IDType | null>(null);
  const [idDoc, setIdDoc] = useState<{ name: string; uri: string } | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [registerAgent, { loading }] = useMutation(REGISTER_AGENT);

  // ── Validate ──────────────────────────────────────────────────────────────

  const validate = () => {
    const e: Record<string, string> = {};
    if (!street.trim()) e.street = 'Street address is required.';
    if (!city.trim()) e.city = 'City is required.';
    if (!state.trim()) e.state = 'State is required.';
    if (!country.trim()) e.country = 'Country is required.';
    if (!agencyName.trim()) e.agencyName = 'Agency name is required.';
    // if (!cacNumber.trim()) {
    //   e.cacNumber = 'CAC number is required.';
    // } else if (!CAC_REGEX.test(cacNumber.trim())) {
    //   e.cacNumber = 'Please enter a valid CAC registration number.';
    // }
    const exp = parseInt(yearsExp, 10);
    if (!yearsExp || isNaN(exp) || exp < 0) e.yearsExp = 'Enter a valid number of years.';
    if (!idType) e.idType = 'Please select an ID type.';
    if (!idDoc) e.idDoc = 'Please upload an ID document.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Document pick ─────────────────────────────────────────────────────────

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      if (file.size && file.size > 5 * 1024 * 1024) {
        Alert.alert('File too large', 'Please upload a file smaller than 5MB.');
        return;
      }
      setIdDoc({ name: file.name, uri: file.uri });
      setErrors(prev => ({ ...prev, idDoc: '' }));
    } catch {
      Alert.alert('Error', 'Could not open document picker.');
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      const result = await registerAgent({
        variables: {
          input: {
            // address: {
            //   street,
            //   city,
            //   state,
            //   country,
            // },
            agency_name: agencyName,
            cac_number: cacNumber,
            license_number: licenseNumber || undefined,
            years_experience: parseInt(yearsExp, 10),
            id_type: idType,
          },
        },
      });
      if (result.data?.registerAgentProfile.success) {

        Alert.alert(
          'Application Submitted',
          result.data.registerAgentProfile.message,
          // 'Your agent application is under review. We\'ll notify you once approved.',
          [{ text: 'OK', onPress: () => {
            const user = useAuthStore.getState().user
            useAuthStore.setState({user: {...user, role: 'agent'} })

            switchMode('host')
            // navigation.goBack()
          } }]
        );
      } else {
        Alert.alert('Error', result.data?.registerAgentProfile?.message)
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong. Please try again.');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.header, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Become an Agent</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { backgroundColor: colors.background }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Banner */}
        <View style={[styles.heroBanner, { backgroundColor: '#FFF0EF' }]}>
          <Image
            // source={require('../assets/agent-hero.png')}
            style={styles.heroImage}
            resizeMode="contain"
          />
          <Text style={[styles.heroTitle, { color: colors.text }]}>Unlock Agent Benefits</Text>
          <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
            Complete the form below to upgrade your account and start managing leads today.
          </Text>
        </View>

        {/* ── Address Information ── */}
        <SectionHeader
          colors={colors}
          label="Address Information"
          icon={<Ionicons name="location-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />}
        />

        <Field label="Street Address" error={errors.street} colors={colors}>
          <StyledInput
            placeholder="e.g. 123 Business Avenue"
            value={street}
            onChangeText={(v: string) => { setStreet(v); setErrors(p => ({ ...p, street: '' })); }}
            hasError={!!errors.street}
            colors={colors}
          />
        </Field>

        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Field label="City" error={errors.city} colors={colors}>
              <StyledInput
                placeholder="City name"
                value={city}
                onChangeText={(v: string) => { setCity(v); setErrors(p => ({ ...p, city: '' })); }}
                hasError={!!errors.city}
                colors={colors}
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="State" error={errors.state} colors={colors}>
              <StyledInput
                placeholder="State/Province"
                value={state}
                onChangeText={(v: string) => { setState(v); setErrors(p => ({ ...p, state: '' })); }}
                hasError={!!errors.state}
                colors={colors}
              />
            </Field>
          </View>
        </View>

        <Field label="Country" error={errors.country} colors={colors}>
          <StyledInput
            placeholder="Your country"
            value={country}
            onChangeText={(v: string) => { setCountry(v); setErrors(p => ({ ...p, country: '' })); }}
            hasError={!!errors.country}
            colors={colors}
          />
        </Field>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* ── Agent Information ── */}
        <SectionHeader
          colors={colors}
          label="Agent Information"
          icon={<MaterialCommunityIcons name="briefcase-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />}
        />

        <Field label="Agency Name" error={errors.agencyName} colors={colors}>
          <StyledInput
            placeholder="e.g. Prime Realty Ltd"
            value={agencyName}
            onChangeText={(v: string) => { setAgencyName(v); setErrors(p => ({ ...p, agencyName: '' })); }}
            hasError={!!errors.agencyName}
            colors={colors}
          />
        </Field>

        <Field label="CAC Number" error={errors.cacNumber} colors={colors}>
          <StyledInput
            placeholder="e.g. RC123456"
            value={cacNumber}
            onChangeText={(v: string) => { setCacNumber(v); setErrors(p => ({ ...p, cacNumber: '' })); }}
            hasError={!!errors.cacNumber}
            autoCapitalize="characters"
            colors={colors}
          />
        </Field>

        <Field label="License Number (optional)" colors={colors}>
          <StyledInput
            placeholder="e.g. ESVARBON/F/0001"
            value={licenseNumber}
            onChangeText={setLicenseNumber}
            hasError={false}
            colors={colors}
          />
        </Field>

        <Field label="Years of Experience" error={errors.yearsExp} colors={colors}>
          <StyledInput
            placeholder="0"
            value={yearsExp}
            onChangeText={(v: string) => { setYearsExp(v.replace(/[^0-9]/g, '')); setErrors(p => ({ ...p, yearsExp: '' })); }}
            keyboardType="number-pad"
            hasError={!!errors.yearsExp}
            colors={colors}
          />
        </Field>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* ── Identity Verification ── */}
        <SectionHeader
          colors={colors}
          label="Identity Verification"
          icon={<MaterialCommunityIcons name="shield-check-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />}
        />

        {/* ID Type Dropdown */}
        <Field label="ID Type" error={errors.idType} colors={colors}>
          <TouchableOpacity
            style={[
              styles.input,
              styles.dropdownTrigger,
              {
                borderColor: errors.idType ? colors.error : dropdownOpen ? colors.primary : colors.border,
                backgroundColor: colors.backgroundInput,
              },
            ]}
            onPress={() => setDropdownOpen(o => !o)}
            activeOpacity={0.8}
          >
            <Text style={{ color: idType ? colors.text : colors.textPlaceholder, flex: 1 }}>
              {idType ? ID_TYPE_OPTIONS.find(o => o.value === idType)?.label : 'Select an ID type'}
            </Text>
            <Ionicons
              name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {dropdownOpen && (
            <View style={[styles.dropdownList, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}>
              {ID_TYPE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.dropdownItem,
                    idType === opt.value && { backgroundColor: colors.primary + '18' },
                  ]}
                  onPress={() => {
                    setIdType(opt.value);
                    setDropdownOpen(false);
                    setErrors(p => ({ ...p, idType: '' }));
                  }}
                >
                  <Text style={[
                    styles.dropdownItemText,
                    { color: idType === opt.value ? colors.primary : colors.text },
                  ]}>
                    {opt.label}
                  </Text>
                  {idType === opt.value && (
                    <Ionicons name="checkmark" size={16} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Field>

        {/* Document Upload */}
        <Field label="" error={errors.idDoc} colors={colors}>
          <TouchableOpacity
            style={[
              styles.uploadBox,
              {
                borderColor: errors.idDoc ? colors.error : idDoc ? colors.success : colors.border,
                backgroundColor: colors.backgroundInput,
              },
            ]}
            onPress={pickDocument}
            activeOpacity={0.75}
          >
            {idDoc ? (
              <>
                <Feather name="file-text" size={28} color={colors.success} />
                <Text style={[styles.uploadedName, { color: colors.text }]} numberOfLines={1}>
                  {idDoc.name}
                </Text>
                <Text style={[styles.uploadHint, { color: colors.success }]}>Tap to replace</Text>
              </>
            ) : (
              <>
                <MaterialCommunityIcons name="cloud-upload-outline" size={32} color={colors.primary} />
                <Text style={[styles.uploadLabel, { color: colors.text }]}>Upload ID Document</Text>
                <Text style={[styles.uploadHint, { color: colors.textPlaceholder }]}>PDF, JPG, or PNG (Max 5MB)</Text>
              </>
            )}
          </TouchableOpacity>
        </Field>

        {/* Security note */}
        <View style={styles.securityRow}>
          <Feather name="lock" size={12} color={colors.textSecondary} />
          <Text style={[styles.securityText, { color: colors.textSecondary }]}>
            Your data is encrypted and securely stored.
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: loading ? 0.75 : 1 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Upgrade to Agent</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 80
  },

  // Hero
  heroBanner: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 28,
  },
  heroImage: {
    width: 130,
    height: 100,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 6,
    textAlign: 'center',
  },
  heroSub: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 24,
  },

  // Fields
  fieldWrap: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
    letterSpacing: 0.1,
  },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1.2,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    gap: 4,
  },
  errorText: {
    fontSize: 11.5,
    fontWeight: '500',
  },

  // Dropdown
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownList: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1.2,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    zIndex: 99,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Upload
  uploadBox: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 28,
    alignItems: 'center',
    gap: 6,
  },
  uploadLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  uploadHint: {
    fontSize: 12,
  },
  uploadedName: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 240,
    textAlign: 'center',
  },

  // Security
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    marginBottom: 24,
    gap: 5,
  },
  securityText: {
    fontSize: 11.5,
  },

  // Submit
  submitBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
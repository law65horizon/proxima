import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/theme/theme';
import { gql, useQuery } from '@apollo/client';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Dimensions,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

const { width } = Dimensions.get('screen');
const AVATAR_SIZE = 72;

// ─── GraphQL ──────────────────────────────────────────────────────────────────

const MY_AGENT_PROFILE = gql`
  query MyAgentProfile {
    myAgentProfile {
      id
      agency_name
      verification_status
      id_verified
      total_listings
      total_bookings
      avg_rating
      years_experience
      badges {
        id
        awarded_at
        expires_at
        badge {
          id
          code
          label
          description
          icon_url
        }
      }
    }
  }
`;

// ─── Types ────────────────────────────────────────────────────────────────────

// Matches enum VerificationStatus { unverified pending verified rejected }
type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

type Badge = {
  id: string;
  code: string;
  label: string;
  description?: string;
  icon_url?: string;
};

type UserBadge = {
  id: string;
  badge: Badge;
  awarded_at: string;
  expires_at?: string;
};

type AgentProfile = {
  id: string;
  agency_name?: string;
  verification_status: VerificationStatus;
  id_verified: boolean;
  total_listings: number;
  total_bookings: number;
  avg_rating?: number;
  years_experience?: number;
  badges?: UserBadge[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VERIFICATION_META: Record<VerificationStatus, { label: string; color: string; icon: any }> = {
  verified:   { label: 'Verified Agent',       color: '#10B981', icon: 'checkmark-circle' },
  pending:    { label: 'Verification Pending', color: '#F59E0B', icon: 'time-outline' },
  rejected:   { label: 'Verification Failed',  color: '#EF4444', icon: 'close-circle' },
  unverified: { label: 'Unverified',           color: '#9CA3AF', icon: 'alert-circle-outline' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ label, theme }: { label: string; theme: any }) {
  return (
    <ThemedText secondary style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>
      {label.toUpperCase()}
    </ThemedText>
  );
}

function MenuCard({ children, theme }: { children: React.ReactNode; theme: any }) {
  return (
    <View style={[styles.menuCard, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
      {children}
    </View>
  );
}

function MenuDivider({ theme }: { theme: any }) {
  return <View style={[styles.menuDivider, { backgroundColor: theme.colors.border }]} />;
}

function MenuItem({
  icon,
  label,
  theme,
  onPress,
  destructive = false,
}: {
  icon: any;
  label: string;
  theme: any;
  onPress: () => void;
  destructive?: boolean;
}) {
  const color = destructive ? theme.colors.error : theme.colors.text;
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={22} color={color} />
      <ThemedText style={[styles.menuRowLabel, { color }]}>{label}</ThemedText>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
    </TouchableOpacity>
  );
}

function StatPill({ value, label, theme }: { value: string | number; label: string; theme: any }) {
  return (
    <View style={styles.statPill}>
      <ThemedText style={[styles.statValue, { color: theme.colors.text }]}>{value}</ThemedText>
      <ThemedText style={[styles.statLabel, { color: theme.colors.textSecondary }]}>{label}</ThemedText>
    </View>
  );
}

function AgentCard({ profile, theme }: { profile: AgentProfile; theme: any }) {
  const meta = VERIFICATION_META[profile.verification_status] ?? VERIFICATION_META.unverified;
  const rating = profile.avg_rating ? profile.avg_rating.toFixed(1) : '—';

  return (
    <View style={[styles.agentCard, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
      {/* Header row */}
      <View style={styles.agentCardHeader}>
        <View>
          <ThemedText style={[styles.agentAgency, { color: theme.colors.text }]}>
            {profile.agency_name ?? 'Independent Agent'}
          </ThemedText>
          {/* Verification pill */}
          <View style={[styles.verificationPill, { backgroundColor: meta.color + '18' }]}>
            <Ionicons name={meta.icon} size={12} color={meta.color} />
            <ThemedText style={[styles.verificationLabel, { color: meta.color }]}>
              {meta.label}
            </ThemedText>
          </View>
        </View>

        {/* Rating bubble */}
        <View style={[styles.ratingBubble, { backgroundColor: theme.colors.warning + '18' }]}>
          <Ionicons name="star" size={13} color={theme.colors.warning} />
          <ThemedText style={[styles.ratingText, { color: theme.colors.warning }]}>{rating}</ThemedText>
        </View>
      </View>

      {/* Stats row */}
      <View style={[styles.statsRow, { borderTopColor: theme.colors.border }]}>
        <StatPill value={profile.total_listings} label="Listings" theme={theme} />
        <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />
        <StatPill value={profile.total_bookings} label="Bookings" theme={theme} />
        <View style={[styles.statDivider, { backgroundColor: theme.colors.border }]} />
        <StatPill value={profile.years_experience ?? '—'} label="Yrs Exp." theme={theme} />
      </View>

      {/* Badges */}
      {profile.badges && profile.badges.length > 0 && (
        <View style={[styles.badgesSection, { borderTopColor: theme.colors.border }]}>
          <ThemedText style={[styles.badgesTitle, { color: theme.colors.textSecondary }]}>
            BADGES
          </ThemedText>
          <View style={styles.badgesList}>
            {profile.badges.map(userBadge => (
              <View
                key={userBadge.id}
                style={[styles.badge, { backgroundColor: theme.colors.primary + '15', borderColor: theme.colors.primary + '30' }]}
              >
                {userBadge.badge.icon_url ? (
                  // icon_url — render as emoji fallback or Image if needed
                  <ThemedText style={styles.badgeEmoji}>{userBadge.badge.icon_url}</ThemedText>
                ) : (
                  <MaterialCommunityIcons name="medal-outline" size={14} color={theme.colors.primary} />
                )}
                <ThemedText style={[styles.badgeName, { color: theme.colors.primary }]}>
                  {userBadge.badge.label}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileTab() {
  const { theme } = useTheme();
  const { isAuthenticated, user, isLoading, mode, switchMode, logout } = useAuthStore();
  const isDark = theme.mode === 'dark';

  const isAgent = user?.role === 'agent' || user?.role === 'AGENT';

  const { data: agentData, refetch } = useQuery(MY_AGENT_PROFILE, {
    skip: !isAgent,
    fetchPolicy: 'cache-and-network',
  });
  const [isRefetching, setIsRefetching] = useState(false)
  

  const agentProfile: AgentProfile | undefined = agentData?.myAgentProfile;

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
        },
      },
    ]);
  };

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  
  const refetchData = async() => {
      if (isRefetching) return
      try {
        setIsRefetching(true)
        await refetch()
      } catch (error) {
        Alert.alert('Failed to Refetch Data')
      } finally {
        setIsRefetching(false)
      }
    }

  const displayName = user?.name || user?.email?.split('@')[0] || 'Traveller';

  // ─── UNAUTHENTICATED ──────────────────────────────────────────────────────

  if (!user && !isLoading) {
    return (
      <ThemedView plain secondary style={styles.guestRoot}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={[styles.topBlob, { backgroundColor: theme.colors.primary }]} />
        <View style={styles.guestContent}>
          <View style={[styles.guestAvatar, { backgroundColor: theme.colors.backgroundSec ?? '#f4f4f4' }]}>
            <Ionicons name="person-outline" size={40} color={theme.colors.textSecondary} />
          </View>
          <ThemedText style={styles.guestHeading}>Welcome</ThemedText>
          <ThemedText secondary style={styles.guestSub}>
            Sign in to manage bookings, view trips and update your preferences.
          </ThemedText>
          <TouchableOpacity
            onPress={() => router.push('/(guest)/(auth)/auth_page')}
            style={[styles.ctaButton, { backgroundColor: theme.colors.primary }]}
            activeOpacity={0.85}
          >
            <ThemedText style={[styles.ctaButtonText, { color: '#fff' }]}>Log in or sign up</ThemedText>
          </TouchableOpacity>
        </View>
        <View style={[styles.guestMenu, { borderTopColor: theme.colors.border }]}>
          {[
            { icon: 'help-circle-outline' as const, label: 'Help & support', onPress: () => router.push('/profile/help') },
            { icon: 'document-text-outline' as const, label: 'Legal & Privacy', onPress: () => router.push('/profile/legal') },
          ].map((item, i, arr) => (
            <React.Fragment key={item.label}>
              <TouchableOpacity style={styles.guestMenuItem} onPress={item.onPress} activeOpacity={0.7}>
                <Ionicons name={item.icon} size={20} color={theme.colors.text} />
                <ThemedText style={styles.guestMenuLabel}>{item.label}</ThemedText>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              {i < arr.length - 1 && (
                <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
              )}
            </React.Fragment>
          ))}
        </View>
      </ThemedView>
    );
  }

  // ─── AUTHENTICATED ────────────────────────────────────────────────────────

  return (
    <ThemedView plain secondary style={{ flex: 1 }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Floating mode switcher */}
      {user?.role && user?.role !== 'renter' && (
        <View style={[styles.floatBar, { bottom: 90 }]}>
          <TouchableOpacity
            onPress={() => (mode === 'host' ? switchMode('guest') : switchMode('host'))}
            style={[styles.modeToggle, { backgroundColor: theme.colors.accent }]}
            activeOpacity={0.85}
          >
            <Ionicons
              name={mode === 'host' ? 'person-outline' : 'home-outline'}
              size={18}
              color={isDark ? '#000' : '#fff'}
            />
            <ThemedText style={[styles.modeToggleText, { color: isDark ? '#000' : '#fff' }]}>
              Switch to {mode === 'guest' ? 'Host' : 'Guest'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView 
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchData} />}
        contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
      >

        {/* Page header */}
        <View style={styles.pageHeader}>
          <ThemedText style={styles.pageTitle}>Profile</ThemedText>
        </View>

        {/* Identity card */}
        <View style={[styles.identityCard, { backgroundColor: theme.colors.primary }]}>
          <View style={styles.avatarRing}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.background }]}>
              <ThemedText style={[styles.avatarInitials, { color: theme.colors.primary }]}>
                {initials}
              </ThemedText>
            </View>
          </View>

          <View style={styles.identityText}>
            <View style={styles.identityNameRow}>
              <ThemedText style={[styles.identityName, { color: '#fff' }]}>{displayName}</ThemedText>
              {/* Verified checkmark badge inline with name */}
              {agentProfile?.verification_status === 'verified' && (
                <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginLeft: 6, opacity: 0.9 }} />
              )}
            </View>
            {user?.email && (
              <ThemedText style={[styles.identityEmail, { color: 'rgba(255,255,255,0.75)' }]}>
                {user.email}
              </ThemedText>
            )}
            {/* Role pill */}
            {isAgent && (
              <View style={styles.rolePill}>
                <ThemedText style={styles.rolePillText}>Agent</ThemedText>
              </View>
            )}
          </View>
        </View>

        {/* Mode badge */}
        <View style={[styles.modeBadge, { backgroundColor: theme.colors.backgroundSec ?? '#f4f4f4' }]}>
          <View style={[styles.modeDot, { backgroundColor: theme.colors.accent }]} />
          <ThemedText secondary style={styles.modeBadgeText}>
            You're browsing as a{' '}
            <ThemedText style={[styles.modeBadgeStrong, { color: theme.colors.accent }]}>
              {mode ?? 'guest'}
            </ThemedText>
          </ThemedText>
        </View>

        {/* ── Agent Profile Card ── */}
        {isAgent && agentProfile && (
          <>
            <SectionLabel label="Agent Profile" theme={theme} />
            <AgentCard profile={agentProfile} theme={theme} />
            <View style={{ height: 20 }} />
          </>
        )}

        {/* ── Settings ── */}
        <SectionLabel label="Settings" theme={theme} />
        <MenuCard theme={theme}>
          <MenuItem
            icon="person-circle-outline"
            label="View profile"
            theme={theme}
            onPress={() => router.push({
              pathname: '/(guest)/(modals)/host_profile/[host_profile]',
              params: { host_profile: user.id },
            })}
          />
          <MenuDivider theme={theme} />
          <MenuItem
            icon="settings-outline"
            label="Account settings"
            theme={theme}
            onPress={() => {}}
          />
        </MenuCard>

        {/* ── Support ── */}
        <SectionLabel label="Support" theme={theme} />
        <MenuCard theme={theme}>
          <MenuItem
            icon="help-buoy-outline"
            label="Help & support"
            theme={theme}
            onPress={() => router.push('/profile/help')}
          />
          <MenuDivider theme={theme} />
          <MenuItem
            icon="document-text-outline"
            label="Legal & Privacy"
            theme={theme}
            onPress={() => router.push('/profile/legal')}
          />
        </MenuCard>

        {/* ── Account ── */}
        <SectionLabel label="Account" theme={theme} />
        <MenuCard theme={theme}>
          {(!user.role || user.role === 'renter') && (
            <>
              <MenuItem
                icon="people-sharp"
                label="Become an Agent"
                theme={theme}
                onPress={() => router.push('/(guest)/(tabs)/profile/unboardagent')}
              />
              <MenuDivider theme={theme} />
            </>
          )}
          <MenuItem icon="lock-closed-outline" label="Privacy" theme={theme} onPress={() => {}} />
          <MenuDivider theme={theme} />
          <MenuItem
            icon="log-out-outline"
            label="Log out"
            theme={theme}
            onPress={handleLogout}
            destructive
          />
        </MenuCard>

        <View style={{ height: 120 }} />
      </ScrollView>
    </ThemedView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Guest
  guestRoot: { flex: 1 },
  topBlob: {
    position: 'absolute',
    top: -width * 0.4,
    right: -width * 0.3,
    width: width * 0.85,
    height: width * 0.85,
    borderRadius: width * 0.425,
    opacity: 0.12,
  },
  guestContent: { flex: 1, paddingHorizontal: 28, paddingTop: 100, alignItems: 'center' },
  guestAvatar: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  guestHeading: { fontSize: 28, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  guestSub: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 280, marginBottom: 32 },
  ctaButton: { width: '100%', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  ctaButtonText: { fontSize: 16, fontWeight: '600' },
  guestMenu: { paddingHorizontal: 20, paddingBottom: 100, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16 },
  guestMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  guestMenuLabel: { flex: 1, fontSize: 15 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 36 },

  // Authenticated
  floatBar: { position: 'absolute', left: 0, right: 0, zIndex: 10, alignItems: 'center' },
  modeToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 28, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8 },
  modeToggleText: { fontSize: 15, fontWeight: '600' },
  scrollContent: { paddingHorizontal: 20 },
  pageHeader: { paddingTop: 64, paddingBottom: 20 },
  pageTitle: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },

  // Identity card
  identityCard: { borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  avatarRing: { padding: 3, borderRadius: AVATAR_SIZE / 2 + 3, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 26, fontWeight: '700' },
  identityText: { flex: 1 },
  identityNameRow: { flexDirection: 'row', alignItems: 'center' },
  identityName: { fontSize: 18, fontWeight: '700' },
  identityEmail: { fontSize: 13, marginTop: 2 },
  rolePill: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)' },
  rolePillText: { fontSize: 11, fontWeight: '600', color: '#fff', letterSpacing: 0.3 },

  // Mode badge
  modeBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, marginBottom: 24 },
  modeDot: { width: 8, height: 8, borderRadius: 4 },
  modeBadgeText: { fontSize: 13 },
  modeBadgeStrong: { fontWeight: '600' },

  // Agent card
  agentCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 4 },
  agentCardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 16 },
  agentAgency: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  verificationPill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  verificationLabel: { fontSize: 11.5, fontWeight: '600' },
  ratingBubble: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  ratingText: { fontSize: 13, fontWeight: '700' },

  // Stats
  statsRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  statPill: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '700' },
  statLabel: { fontSize: 11, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth },

  // Badges
  badgesSection: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16, paddingTop: 12 },
  badgesTitle: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, marginBottom: 10 },
  badgesList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  badgeEmoji: { fontSize: 13 },
  badgeName: { fontSize: 12, fontWeight: '600' },

  // Menu
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  menuCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 20 },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15, gap: 12 },
  menuRowLabel: { flex: 1, fontSize: 15, fontWeight: '400' },
  menuDivider: { height: StyleSheet.hairlineWidth, marginLeft: 50 },
});
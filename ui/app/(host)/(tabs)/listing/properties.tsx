// screens/host/HostPropertiesScreen.tsx
import { useAuthStore } from '@/stores/authStore';
import { usePropertyStore } from '@/stores/usePropertyStore';
import { useTheme } from '@/theme/theme';
import { gql, NetworkStatus, useMutation, useQuery } from '@apollo/client';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const { width } = Dimensions.get('window');

const GET_HOST_PROPERTIES = gql`
query MyProperties {
  myProperties {
    id
    title
    property_type
    description
    speciality
    sale_status
    price
    status
    address {
      id
      street
      city
      country
      postal_code
    }
    amenities
    created_at
    updated_at
    images {
      id
      cdn_url
    }
    roomTypes {
      id
      name
      base_price
      capacity
    }
  }
}
`;

const DELETE_PROPERTY = gql`
  mutation DeleteProperty($id: ID!) {
    deleteProperty(id: $id) {
      success
      message
    }
  }
`;


type PropertyStatus = 'all' | 'published' | 'draft' | 'pending_review' | 'archived';
type PropertyType = 'all' | 'apartment' | 'house' | 'hotel';
type SaleStatus = 'all' | 'rent' | 'sale' | 'sold'; 
type StatusCounts = Record<PropertyStatus, number>;

const HostProperties = () => {
  const { theme } = useTheme();
  const [statusFilter, setStatusFilter] = useState<PropertyStatus>('all');
  const [typeFilter, setTypeFilter] = useState<PropertyType>('all');
  const [saleFilter, setSaleFilter] = useState<SaleStatus>('all');
  const [showFilters, setShowFilters] = useState(false);
  const user = useAuthStore.getState().user
  const setField = usePropertyStore((state) => state.setField)

  const { data, loading, error, refetch, networkStatus } = useQuery(
    GET_HOST_PROPERTIES, 
    {
      // variables: {realtorId: user?.id || 3},
      fetchPolicy: 'cache-and-network'
    },
    
  );
  const isFromCache = !loading && networkStatus === NetworkStatus.ready;

  console.log({isFromCache})
  const [deleteProperty] = useMutation(DELETE_PROPERTY, {
    update(cache, {data}, {variables}) {
      if (data?.deleteProperty.success) {
        console.log({variables})
        const normarlizedId = cache.identify({id: variables?.id, __typename: 'Property'})

        cache.evict({id: normarlizedId})

        cache.gc()
      }
    }
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // console.log({data: data?.myProperties[0].roomTypes})

  const properties = data?.myProperties || [];
  // const properties = GET_HOST_PROPERTIES_MOCK.data.myProperties

  // Filter properties based on selected filters
  const filteredProperties = useMemo(() => {
    return properties.filter((property: any) => {
      const matchesStatus = statusFilter === 'all' || property.status === statusFilter;
      const matchesType = typeFilter === 'all' || property.property_type === typeFilter;
      const matchesSale = saleFilter === 'all' || property.sale_status === saleFilter;
      return matchesStatus && matchesType && matchesSale;
    });
  }, [properties, statusFilter, typeFilter, saleFilter]);

  // Get counts for each filter
  const counts = useMemo<StatusCounts>(() => {
    return {
      all: properties.length,
      published: properties.filter((p: any) => p.status === 'published').length,
      draft: properties.filter((p: any) => p.status === 'draft').length,
      pending_review: properties.filter((p: any) => p.status === 'pending_review').length,
      archived: 0
    };
  }, [properties]);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await refetch();
    } catch (error) {
      
    } finally {
      setIsRefreshing(false)
    }
  }; 

  const populateEditStore = async(property: any) => {
    const basicInfo = {
      propertyType: property.property_type,
      listingType: property.sale_status,
      title: property.title,
      speciality: property?.speciality
    }
    const description = {
      description: property.description,
      amenities: property.amenities
    }
    const address = {...property.address, postcode: property.address.postal_code}
    const photos = property.images
    const pricing = property.price.toLocaleString()
    const propertyId = property.id
    setField('basicInfo', basicInfo)

    setField('description', description)

    setField('photos', photos)

    setField('pricing', pricing)

    setField('address', address)

    setField('mode', 'edit')

    setField('snapshot', {basicInfo, description, address, photos, pricing, propertyId})
  }

  const handleDeleteProperty = (propertyId: string, propertyTitle: string) => {
    Alert.alert(
      'Delete Property',
      `Are you sure you want to delete "${propertyTitle}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProperty({ variables: { id: propertyId } });
              // await refetch();
              Alert.alert('Success', 'Property deleted successfully');
            } catch (err) {
              Alert.alert('Error', 'Failed to delete property');
            }
          },
        },
      ]
    );
  }; 

  const getStatusColor = (status: string) => {
    switch (status.toLocaleLowerCase()) {
      case 'published':
        return theme.colors.success;
      case 'draft':
        return theme.colors.textSecondary;
      case 'pending_review':
        return theme.colors.warning;
      case 'archived':
        return theme.colors.error;
      default:
        return theme.colors.textSecondary;
    }
  }; 

  const getStatusIcon = (status: string) => {
    switch (status.toLocaleLowerCase()) {
      case 'published':
        return 'checkmark-circle';
      case 'draft':
        return 'document-text-outline';
      case 'pending_review':
        return 'time-outline';
      case 'archived':
        return 'archive-outline';
      default:
        return 'document-outline';
    }
  };
 
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'apartment':
        return 'business';
      case 'house':
        return 'home';
      case 'hotel':
        return 'bed';
      default:
        return 'location';
    }
  };

  const renderPropertyCard = (property: any) => {
    const primaryImage = property.images?.find((img: any) => img.is_primary) || property.images?.[0];
    const hasRoomTypes = property.property_type == 'apartment' || property.property_type == 'hotel';
    // const hasRoomTypes = property.property_type === 'apartment' || property.property_type === 'hotel';
    console.log({hasRoomTypes}, property.property_type)
    return (
      <TouchableOpacity
        key={property.id}
        style={[styles.propertyCard, { backgroundColor: theme.colors.card }]}
        onPress={() => router.push({
          pathname: '/listing/room_types',
          params: { id: property.id }
        })}
        activeOpacity={0.8} 
      >
        {/* Image Section */}
        <View style={styles.imageContainer}>
          <Image
            source={{
              uri: primaryImage?.cdn_url || 'https://via.placeholder.com/400x200?text=No+Image'
            }}
            style={styles.propertyImage}
          />
          
          {/* Status Badge */}
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(property.status) }]}>
            <Ionicons name={getStatusIcon(property.status) as any} size={12} color="#FFFFFF" />
            <Text style={styles.statusText}>{property.status.replace('_', ' ').toUpperCase()}</Text>
          </View>

          {/* Type Badge */}
          <View style={[styles.typeBadge, { backgroundColor: theme.colors.card }]}>
            <Ionicons name={getTypeIcon(property.property_type) as any} size={14} color={theme.colors.primary} />
            <Text style={[styles.typeText, { color: theme.colors.text }]}>
              {property.property_type}
            </Text>
          </View>
        </View>

        {/* Content Section */}
        <View style={styles.cardContent}>
          <Text style={[styles.propertyTitle, { color: theme.colors.text, textTransform: 'capitalize' }]} numberOfLines={2}>
            {property.title}
          </Text> 

          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={[styles.locationText, { color: theme.colors.textSecondary, textTransform: 'capitalize' }]} numberOfLines={1}>
              {property.address?.city}, {property.address?.country}
            </Text>
          </View>

          {/* Info Grid */}
          <View style={styles.infoGrid}>
            <View style={[styles.infoBox, { backgroundColor: theme.colors.backgroundSec }]}>
              <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>Price</Text>
              <Text style={[styles.infoValue, { color: theme.colors.text }]} numberOfLines={1}>
                ${property.price?.toLocaleString()}
              </Text>
            </View>

            <View style={[styles.infoBox, { backgroundColor: theme.colors.backgroundSec }]}>
              <Text style={[styles.infoLabel, { color: theme.colors.textSecondary }]}>Listing</Text>
              <Text style={[styles.infoValue, { color: theme.colors.text }]} numberOfLines={1}>
                {property.sale_status}
              </Text>
            </View>
          </View>  

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.colors.backgroundSec }]}
              onPress={() => {
                populateEditStore(property)
                router.push('/listing/edit/basic_info')} 
              }
            >
              <Ionicons name="create-outline" size={18} color={theme.colors.text} />
              <Text style={[styles.actionButtonText, { color: theme.colors.text }]}>Edit</Text>
            </TouchableOpacity>

            {hasRoomTypes && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.colors.backgroundSec, justifyContent: 'space-around' }]}
                onPress={() => router.push({
                  pathname: '/listing/room_types',
                  params: { id: property.id }
                })}
                // onPress={() => router.push('/(host)/(tabs)/listing/room_types')}
              >
                <View style={{alignItems: 'center', flexDirection: 'row', gap:6}}>
                  <Ionicons name="bed-outline" size={18} color={theme.colors.text} />
                  <Text style={[styles.actionButtonText, { color: theme.colors.text }]}>Rooms</Text>
                </View>
                {properties.room_types?.length > 0 && <Text style={[styles.infoValue, { color: theme.colors.primary }]}>
                  {property.room_types.length} 1
                </Text>}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton, { backgroundColor: theme.colors.error + '15' }]}
              onPress={() => handleDeleteProperty(property.id, property.title)}
            >
              <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !isRefreshing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */} 
      <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
        <View>
          <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>
            Host Dashboard
          </Text>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            My Properties 
          </Text>
        </View>      

        <TouchableOpacity
          style={[styles.filterButton, { backgroundColor: theme.colors.card }]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons name="options-outline" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {/* Filter Panel */}
      {showFilters && (
        <View style={[styles.filterPanel, { backgroundColor: theme.colors.card }]}>
          {/* Status Filter */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { color: theme.colors.textSecondary }]}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
              {(['all', 'published', 'draft', 'pending_review',] as PropertyStatus[]).map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.filterChip,
                    { backgroundColor: theme.colors.backgroundSec },
                    statusFilter === status && { backgroundColor: theme.colors.primary }
                  ]}
                  onPress={() => setStatusFilter(status)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: theme.colors.text },
                      statusFilter === status && { color: '#FFFFFF' }
                    ]}
                  >
                    {status === 'all' ? `All (${counts.all})` : `${status.replace('_', ' ')} (${counts[status]})`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Type Filter */} 
          <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { color: theme.colors.textSecondary }]}>Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
              {(['all', 'apartment', 'house', 'hotel'] as PropertyType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.filterChip,
                    { backgroundColor: theme.colors.backgroundSec },
                    typeFilter === type && { backgroundColor: theme.colors.primary }
                  ]}
                  onPress={() => setTypeFilter(type)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: theme.colors.text },
                      typeFilter === type && { color: '#FFFFFF' }
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Sale Status Filter */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { color: theme.colors.textSecondary }]}>Listing Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
              {(['all', 'rent', 'sale', 'sold'] as SaleStatus[]).map((sale) => (
                <TouchableOpacity
                  key={sale}
                  style={[
                    styles.filterChip,
                    { backgroundColor: theme.colors.backgroundSec },
                    saleFilter === sale && { backgroundColor: theme.colors.primary }
                  ]}
                  onPress={() => setSaleFilter(sale)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: theme.colors.text },
                      saleFilter === sale && { color: '#FFFFFF' }
                    ]}
                  >
                    {sale}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Properties List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        {filteredProperties.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconContainer, { backgroundColor: theme.colors.backgroundSec }]}>
              <Ionicons name="home-outline" size={48} color={theme.colors.textSecondary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
              No properties found
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
              {statusFilter !== 'all' || typeFilter !== 'all' || saleFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first property to get started'}
            </Text>
          </View>
        ) : (
          filteredProperties.map((property: any) => renderPropertyCard(property))
        )}
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        // onPress={() => router.push('/(host)/(tabs)/listing/start')}
        onPress={() => router.push('/(host)/(tabs)/listing/edit/basic_info')}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity> 
    </View>
  );
}

export default HostProperties

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  filterPanel: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  filterSection: {
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChips: {
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  propertyCard: {
    borderRadius: 20,
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  imageContainer: {
    position: 'relative',
    height: 200,
  },
  propertyImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E0E0E0',
  },
  statusBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  typeBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  cardContent: {
    padding: 16,
  },
  propertyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 26,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  locationText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  infoBox: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'capitalize'
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  deleteButton: {
    flex: 0,
    paddingHorizontal: 12,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
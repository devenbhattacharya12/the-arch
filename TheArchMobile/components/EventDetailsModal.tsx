// components/EventDetailsModal.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiService } from '../app/_layout';

// Add this near the top of the file, after imports
const API_BASE_URL = 'http://10.0.0.51:3000/api';

interface GetTogether {
  _id: string;
  title: string;
  description?: string;
  type: 'in-person' | 'virtual';
  scheduledFor: string;
  location?: string;
  virtualLink?: string;
  image?: string;
  creator: {
    _id: string;
    name: string;
    avatar?: string;
  };
  invitees: {
    user: {
      _id: string;
      name: string;
      avatar?: string;
    };
    status: 'pending' | 'accepted' | 'declined';
    respondedAt?: string;
  }[];
  status: 'planning' | 'active' | 'completed';
}

interface EventDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  event: GetTogether | null;
  onEventUpdated: (event: GetTogether) => void;
}

export default function EventDetailsModal({
  visible,
  onClose,
  event,
  onEventUpdated,
}: EventDetailsModalProps) {
  const [loading, setLoading] = useState(false);
  const [userRsvp, setUserRsvp] = useState<'pending' | 'accepted' | 'declined'>('pending');
  const [currentUserId, setCurrentUserId] = useState<string>('');

  useEffect(() => {
    if (event && visible) {
      loadCurrentUser();
      findUserRsvp();
    }
  }, [event, visible]);

  const loadCurrentUser = async () => {
    try {
      const user = await ApiService.getCurrentUser();
      setCurrentUserId(user.id);
    } catch (error) {
      console.error('Error loading current user:', error);
    }
  };

  const findUserRsvp = () => {
    if (!event || !currentUserId) return;
    
    const userInvite = event.invitees.find(inv => inv.user._id === currentUserId);
    if (userInvite) {
      setUserRsvp(userInvite.status);
    }
  };

  const handleRsvp = async (status: 'accepted' | 'declined' | 'pending') => {
    if (!event) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/gettogethers/${event._id}/rsvp`,
        {
          method: 'POST',
          headers: await ApiService.getHeaders(),
          body: JSON.stringify({ status }),
        }
      );

      if (response.ok) {
        const updatedEvent = await response.json();
        setUserRsvp(status);
        onEventUpdated(updatedEvent.getTogether);
        
        const statusText = status === 'accepted' ? 'accepted' : 
                          status === 'declined' ? 'declined' : 'marked as maybe';
        Alert.alert('RSVP Updated', `You have ${statusText} this event.`);
      } else {
        const error = await response.json();
        Alert.alert('Error', error.message || 'Failed to update RSVP');
      }
    } catch (error) {
      console.error('Error updating RSVP:', error);
      Alert.alert('Error', 'Failed to update RSVP');
    } finally {
      setLoading(false);
    }
  };

  const openVirtualLink = async () => {
    if (!event?.virtualLink) return;

    try {
      const supported = await Linking.canOpenURL(event.virtualLink);
      if (supported) {
        await Linking.openURL(event.virtualLink);
      } else {
        Alert.alert('Error', 'Cannot open this link');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open link');
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return { dateStr, timeStr };
  };

  const getRsvpStats = () => {
    if (!event) return { accepted: 0, declined: 0, pending: 0 };
    
    return {
      accepted: event.invitees.filter(inv => inv.status === 'accepted').length,
      declined: event.invitees.filter(inv => inv.status === 'declined').length,
      pending: event.invitees.filter(inv => inv.status === 'pending').length,
    };
  };

  if (!event) return null;

  const { dateStr, timeStr } = formatDateTime(event.scheduledFor);
  const rsvpStats = getRsvpStats();
  const isCreator = event.creator._id === currentUserId;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#2d4150" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Event Details</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Event Image */}
          {event.image && (
            <Image source={{ uri: event.image }} style={styles.eventImage} />
          )}

          {/* Event Title and Type */}
          <View style={styles.titleSection}>
            <Text style={styles.eventTitle}>{event.title}</Text>
            <View style={[styles.typeBadge, 
              event.type === 'virtual' ? styles.virtualBadge : styles.inPersonBadge
            ]}>
              <Ionicons 
                name={event.type === 'virtual' ? 'videocam' : 'location'} 
                size={14} 
                color="white" 
              />
              <Text style={styles.typeText}>
                {event.type === 'virtual' ? 'Virtual Event' : 'In-Person Event'}
              </Text>
            </View>
          </View>

          {/* Date and Time */}
          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <Ionicons name="calendar" size={20} color="#007AFF" />
              <Text style={styles.infoText}>{dateStr}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="time" size={20} color="#007AFF" />
              <Text style={styles.infoText}>{timeStr}</Text>
            </View>
          </View>

          {/* Location or Virtual Link */}
          <View style={styles.infoSection}>
            {event.type === 'in-person' && event.location ? (
              <View style={styles.infoRow}>
                <Ionicons name="location" size={20} color="#007AFF" />
                <Text style={styles.infoText}>{event.location}</Text>
              </View>
            ) : event.type === 'virtual' && event.virtualLink ? (
              <TouchableOpacity style={styles.linkRow} onPress={openVirtualLink}>
                <Ionicons name="videocam" size={20} color="#007AFF" />
                <Text style={styles.linkText}>Join Virtual Meeting</Text>
                <Ionicons name="open-outline" size={16} color="#007AFF" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Description */}
          {event.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.descriptionText}>{event.description}</Text>
            </View>
          )}

          {/* Creator */}
          <View style={styles.creatorSection}>
            <Text style={styles.sectionTitle}>Created by</Text>
            <View style={styles.creatorRow}>
              <View style={styles.avatarContainer}>
                {event.creator.avatar ? (
                  <Image source={{ uri: event.creator.avatar }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitial}>
                      {event.creator.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.creatorName}>{event.creator.name}</Text>
            </View>
          </View>

          {/* RSVP Section */}
          <View style={styles.rsvpSection}>
            <Text style={styles.sectionTitle}>Your Response</Text>
            <View style={styles.rsvpButtons}>
              <TouchableOpacity
                style={[styles.rsvpButton, userRsvp === 'accepted' && styles.rsvpButtonActive]}
                onPress={() => handleRsvp('accepted')}
                disabled={loading}
              >
                <Ionicons 
                  name="checkmark-circle" 
                  size={20} 
                  color={userRsvp === 'accepted' ? 'white' : '#28a745'} 
                />
                <Text style={[styles.rsvpButtonText, userRsvp === 'accepted' && styles.rsvpButtonTextActive]}>
                  Going
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.rsvpButton, userRsvp === 'pending' && styles.rsvpButtonActive]}
                onPress={() => handleRsvp('pending')}
                disabled={loading}
              >
                <Ionicons 
                  name="help-circle" 
                  size={20} 
                  color={userRsvp === 'pending' ? 'white' : '#ffc107'} 
                />
                <Text style={[styles.rsvpButtonText, userRsvp === 'pending' && styles.rsvpButtonTextActive]}>
                  Maybe
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.rsvpButton, userRsvp === 'declined' && styles.rsvpButtonActive]}
                onPress={() => handleRsvp('declined')}
                disabled={loading}
              >
                <Ionicons 
                  name="close-circle" 
                  size={20} 
                  color={userRsvp === 'declined' ? 'white' : '#dc3545'} 
                />
                <Text style={[styles.rsvpButtonText, userRsvp === 'declined' && styles.rsvpButtonTextActive]}>
                  Can't Go
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* RSVP Summary */}
          <View style={styles.summarySection}>
            <Text style={styles.sectionTitle}>Who's Coming</Text>
            <View style={styles.rsvpStats}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{rsvpStats.accepted}</Text>
                <Text style={styles.statLabel}>Going</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{rsvpStats.pending}</Text>
                <Text style={styles.statLabel}>Maybe</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{rsvpStats.declined}</Text>
                <Text style={styles.statLabel}>Can't Go</Text>
              </View>
            </View>

            {/* List of attendees */}
            <View style={styles.attendeesList}>
              {event.invitees
                .filter(inv => inv.status === 'accepted')
                .map(invitee => (
                  <View key={invitee.user._id} style={styles.attendeeRow}>
                    <View style={styles.attendeeAvatar}>
                      {invitee.user.avatar ? (
                        <Image source={{ uri: invitee.user.avatar }} style={styles.smallAvatar} />
                      ) : (
                        <View style={styles.smallAvatarPlaceholder}>
                          <Text style={styles.smallAvatarInitial}>
                            {invitee.user.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.attendeeName}>{invitee.user.name}</Text>
                    <View style={styles.statusBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#28a745" />
                    </View>
                  </View>
                ))}
            </View>

            {rsvpStats.pending > 0 && (
              <View style={styles.pendingSection}>
                <Text style={styles.pendingTitle}>Still deciding:</Text>
                {event.invitees
                  .filter(inv => inv.status === 'pending')
                  .map(invitee => (
                    <View key={invitee.user._id} style={styles.attendeeRow}>
                      <View style={styles.attendeeAvatar}>
                        {invitee.user.avatar ? (
                          <Image source={{ uri: invitee.user.avatar }} style={styles.smallAvatar} />
                        ) : (
                          <View style={styles.smallAvatarPlaceholder}>
                            <Text style={styles.smallAvatarInitial}>
                              {invitee.user.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.attendeeName}>{invitee.user.name}</Text>
                      <View style={styles.statusBadge}>
                        <Ionicons name="help-circle" size={16} color="#ffc107" />
                      </View>
                    </View>
                  ))}
              </View>
            )}
          </View>

          <View style={styles.bottomPadding} />
        </ScrollView>

        {/* Loading overlay */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d4150',
  },
  placeholder: {
    width: 24,
  },
  content: {
    flex: 1,
  },
  eventImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#f0f0f0',
  },
  titleSection: {
    padding: 20,
    backgroundColor: 'white',
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2d4150',
    marginBottom: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  virtualBadge: {
    backgroundColor: '#28a745',
  },
  inPersonBadge: {
    backgroundColor: '#6f42c1',
  },
  typeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  infoSection: {
    backgroundColor: 'white',
    padding: 20,
    marginTop: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  infoText: {
    fontSize: 16,
    color: '#2d4150',
    flex: 1,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linkText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
    flex: 1,
  },
  descriptionSection: {
    backgroundColor: 'white',
    padding: 20,
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d4150',
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 16,
    color: '#6c757d',
    lineHeight: 24,
  },
  creatorSection: {
    backgroundColor: 'white',
    padding: 20,
    marginTop: 1,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarContainer: {
    width: 40,
    height: 40,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  creatorName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2d4150',
  },
  rsvpSection: {
    backgroundColor: 'white',
    padding: 20,
    marginTop: 10,
  },
  rsvpButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  rsvpButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#e9ecef',
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  rsvpButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  rsvpButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6c757d',
  },
  rsvpButtonTextActive: {
    color: 'white',
  },
  summarySection: {
    backgroundColor: 'white',
    padding: 20,
    marginTop: 1,
  },
  rsvpStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    marginBottom: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2d4150',
  },
  statLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 2,
  },
  attendeesList: {
    gap: 8,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  attendeeAvatar: {
    width: 32,
    height: 32,
  },
  smallAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  smallAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallAvatarInitial: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  attendeeName: {
    fontSize: 16,
    color: '#2d4150',
    flex: 1,
  },
  statusBadge: {
    padding: 4,
  },
  pendingSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6c757d',
    marginBottom: 8,
  },
  bottomPadding: {
    height: 40,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
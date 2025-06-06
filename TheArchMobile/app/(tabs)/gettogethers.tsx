// app/(tabs)/gettogethers.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
  Dimensions
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import CreateEventModal from '../../components/CreateEventModal';
import EventDetailsModal from '../../components/EventDetailsModal';
import { ApiService } from '../../app/_layout';

// API Configuration - UPDATE THIS WITH YOUR IP ADDRESS
const API_BASE_URL = 'http://10.0.0.51:3000/api';

// Configure calendar locale
LocaleConfig.locales['en'] = {
  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ],
  monthNamesShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  today: 'Today'
};
LocaleConfig.defaultLocale = 'en';

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

export default function GetTogethersScreen() {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [currentMonth, setCurrentMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [events, setEvents] = useState<GetTogether[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<GetTogether | null>(null);
  const [currentArchId, setCurrentArchId] = useState<string>('');

  // Get marked dates for calendar
  const getMarkedDates = () => {
    const marked: any = {};
    
    // Mark dates with events
    events.forEach(event => {
      const date = event.scheduledFor.split('T')[0];
      marked[date] = {
        marked: true,
        dotColor: '#007AFF',
        selectedColor: '#007AFF',
        customStyles: {
          container: {
            backgroundColor: marked[date]?.selected ? '#007AFF' : 'transparent',
            borderRadius: 16,
          },
          text: {
            color: marked[date]?.selected ? 'white' : 'black',
          },
        },
      };
    });

    // Mark selected date
    if (selectedDate) {
      marked[selectedDate] = {
        ...marked[selectedDate],
        selected: true,
        selectedColor: '#007AFF',
      };
    }

    return marked;
  };

  // Load current user's arch (you might want to add arch selection)
  useEffect(() => {
    loadUserArch();
  }, []);

  // Load events when month changes
  useEffect(() => {
    if (currentArchId) {
      loadEvents();
    }
  }, [currentMonth, currentArchId]);

  const loadUserArch = async () => {
    try {
      const arches = await ApiService.getUserArches();
      if (arches.length > 0) {
        setCurrentArchId(arches[0]._id); // Use first arch for now
      }
    } catch (error) {
      console.error('Error loading arches:', error);
    }
  };

  const loadEvents = async () => {
    if (!currentArchId) return;
    
    setLoading(true);
    try {
      const [year, month] = currentMonth.split('-');
      const response = await fetch(
        `${API_BASE_URL}/gettogethers/arch/${currentArchId}?month=${month}&year=${year}`,
        {
          headers: await ApiService.getHeaders(),
        }
      );
      
      if (response.ok) {
        const eventData = await response.json();
        setEvents(eventData);
      }
    } catch (error) {
      console.error('Error loading events:', error);
      Alert.alert('Error', 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const handleDatePress = (day: any) => {
    setSelectedDate(day.dateString);
    
    // Check if there are events on this date
    const dayEvents = events.filter(event => 
      event.scheduledFor.split('T')[0] === day.dateString
    );
    
    if (dayEvents.length > 0) {
      // Show first event (could expand to show list if multiple)
      setSelectedEvent(dayEvents[0]);
      setShowEventModal(true);
    }
  };

  const handleCreateEvent = () => {
    if (!selectedDate) {
      Alert.alert('Select a Date', 'Please select a date on the calendar first');
      return;
    }
    setShowCreateModal(true);
  };

  const handleEventCreated = (newEvent: GetTogether) => {
    setEvents(prevEvents => [...prevEvents, newEvent]);
    setShowCreateModal(false);
    Alert.alert('Success', 'Event created successfully!');
  };

  const handleEventUpdated = (updatedEvent: GetTogether) => {
    setEvents(prevEvents => 
      prevEvents.map(event => 
        event._id === updatedEvent._id ? updatedEvent : event
      )
    );
    setSelectedEvent(updatedEvent);
  };

  const getEventsForSelectedDate = () => {
    if (!selectedDate) return [];
    return events.filter(event => 
      event.scheduledFor.split('T')[0] === selectedDate
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Family Events</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={handleCreateEvent}
        >
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Calendar */}
      <Calendar
        current={currentMonth + '-01'}
        onDayPress={handleDatePress}
        onMonthChange={(month) => {
          setCurrentMonth(`${month.year}-${month.month.toString().padStart(2, '0')}`);
        }}
        markedDates={getMarkedDates()}
        markingType="custom"
        theme={{
          backgroundColor: '#ffffff',
          calendarBackground: '#ffffff',
          textSectionTitleColor: '#b6c1cd',
          selectedDayBackgroundColor: '#007AFF',
          selectedDayTextColor: '#ffffff',
          todayTextColor: '#007AFF',
          dayTextColor: '#2d4150',
          textDisabledColor: '#d9e1e8',
          dotColor: '#007AFF',
          selectedDotColor: '#ffffff',
          arrowColor: '#007AFF',
          disabledArrowColor: '#d9e1e8',
          monthTextColor: '#2d4150',
          indicatorColor: '#007AFF',
          textDayFontFamily: 'System',
          textMonthFontFamily: 'System',
          textDayHeaderFontFamily: 'System',
          textDayFontWeight: '400',
          textMonthFontWeight: '600',
          textDayHeaderFontWeight: '400',
          textDayFontSize: 16,
          textMonthFontSize: 18,
          textDayHeaderFontSize: 14
        }}
      />

      {/* Events for selected date */}
      {selectedDate && (
        <View style={styles.selectedDateSection}>
          <Text style={styles.selectedDateTitle}>
            {new Date(selectedDate).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </Text>
          
          <ScrollView style={styles.eventsContainer}>
            {getEventsForSelectedDate().length === 0 ? (
              <View style={styles.noEventsContainer}>
                <Ionicons name="calendar-outline" size={48} color="#ccc" />
                <Text style={styles.noEventsText}>No events scheduled</Text>
                <TouchableOpacity 
                  style={styles.createFirstEventButton}
                  onPress={() => setShowCreateModal(true)}
                >
                  <Text style={styles.createFirstEventText}>Create Event</Text>
                </TouchableOpacity>
              </View>
            ) : (
              getEventsForSelectedDate().map(event => (
                <TouchableOpacity
                  key={event._id}
                  style={styles.eventCard}
                  onPress={() => {
                    setSelectedEvent(event);
                    setShowEventModal(true);
                  }}
                >
                  <View style={styles.eventHeader}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    <View style={[styles.eventTypeBadge, 
                      event.type === 'virtual' ? styles.virtualBadge : styles.inPersonBadge
                    ]}>
                      <Ionicons 
                        name={event.type === 'virtual' ? 'videocam' : 'location'} 
                        size={12} 
                        color="white" 
                      />
                      <Text style={styles.eventTypeText}>
                        {event.type === 'virtual' ? 'Virtual' : 'In Person'}
                      </Text>
                    </View>
                  </View>
                  
                  <Text style={styles.eventTime}>
                    {new Date(event.scheduledFor).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </Text>
                  
                  {event.description && (
                    <Text style={styles.eventDescription} numberOfLines={2}>
                      {event.description}
                    </Text>
                  )}
                  
                  <View style={styles.rsvpSummary}>
                    <Text style={styles.rsvpText}>
                      {event.invitees.filter(inv => inv.status === 'accepted').length} going • {event.invitees.filter(inv => inv.status === 'pending').length} pending
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      )}

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      )}

      {/* Create Event Modal */}
      <CreateEventModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        selectedDate={selectedDate}
        archId={currentArchId}
        onEventCreated={handleEventCreated}
      />

      {/* Event Details Modal */}
      <EventDetailsModal
        visible={showEventModal}
        onClose={() => setShowEventModal(false)}
        event={selectedEvent}
        onEventUpdated={handleEventUpdated}
      />
    </View>
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
    fontSize: 24,
    fontWeight: '600',
    color: '#2d4150',
  },
  addButton: {
    backgroundColor: '#007AFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedDateSection: {
    flex: 1,
    backgroundColor: 'white',
    marginTop: 10,
    paddingTop: 20,
  },
  selectedDateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d4150',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  eventsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  noEventsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  noEventsText: {
    fontSize: 16,
    color: '#6c757d',
    marginTop: 10,
    marginBottom: 20,
  },
  createFirstEventButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createFirstEventText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  eventCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d4150',
    flex: 1,
    marginRight: 10,
  },
  eventTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  virtualBadge: {
    backgroundColor: '#28a745',
  },
  inPersonBadge: {
    backgroundColor: '#6f42c1',
  },
  eventTypeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  eventTime: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 14,
    color: '#6c757d',
    lineHeight: 20,
    marginBottom: 12,
  },
  rsvpSummary: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  rsvpText: {
    fontSize: 14,
    color: '#6c757d',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
});
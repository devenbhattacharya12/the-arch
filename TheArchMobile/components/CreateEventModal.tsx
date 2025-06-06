// components/CreateEventModal.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { ApiService } from '../app/_layout';

// Add this near the top of the file, after imports
const API_BASE_URL = 'http://10.0.0.51:3000/api';

interface CreateEventModalProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: string;
  archId: string;
  onEventCreated: (event: any) => void;
}

export default function CreateEventModal({
  visible,
  onClose,
  selectedDate,
  archId,
  onEventCreated,
}: CreateEventModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'in-person' | 'virtual'>('in-person');
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [location, setLocation] = useState('');
  const [virtualLink, setVirtualLink] = useState('');
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setType('in-person');
    setSelectedTime(new Date());
    setLocation('');
    setVirtualLink('');
    setImage(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant permission to access photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setImage(result.assets[0]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const removeImage = () => {
    setImage(null);
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      setSelectedTime(selectedTime);
    }
  };

  const createEvent = async () => {
    if (!title.trim()) {
      Alert.alert('Missing Information', 'Please enter an event title');
      return;
    }

    if (type === 'in-person' && !location.trim()) {
      Alert.alert('Missing Information', 'Please enter a location for in-person events');
      return;
    }

    if (type === 'virtual' && !virtualLink.trim()) {
      Alert.alert('Missing Information', 'Please enter a virtual meeting link');
      return;
    }

    setLoading(true);

    try {
      // Combine selected date with selected time
      const eventDateTime = new Date(selectedDate);
      eventDateTime.setHours(selectedTime.getHours());
      eventDateTime.setMinutes(selectedTime.getMinutes());

      // Create FormData for the request
      const formData = new FormData();
      formData.append('archId', archId);
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('type', type);
      formData.append('scheduledFor', eventDateTime.toISOString());
      
      if (type === 'in-person') {
        formData.append('location', location.trim());
      } else {
        formData.append('virtualLink', virtualLink.trim());
      }

      // Add image if selected
      if (image) {
        const imageData = {
          uri: image.uri,
          type: 'image/jpeg',
          name: 'event-image.jpg',
        } as any;
        formData.append('image', imageData);
      }

      const response = await fetch(`${API_BASE_URL}/gettogethers`, {
        method: 'POST',
        headers: {
          ...await ApiService.getHeaders(),
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      if (response.ok) {
        const newEvent = await response.json();
        onEventCreated(newEvent);
        handleClose();
      } else {
        const error = await response.json();
        Alert.alert('Error', error.message || 'Failed to create event');
      }
    } catch (error) {
      console.error('Error creating event:', error);
      Alert.alert('Error', 'Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Event</Text>
          <TouchableOpacity 
            onPress={createEvent}
            disabled={loading || !title.trim()}
            style={[styles.saveButton, (!title.trim() || loading) && styles.saveButtonDisabled]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.saveButtonText}>Create</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Event Title */}
          <View style={styles.section}>
            <Text style={styles.label}>Event Title *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Enter event title"
              maxLength={100}
            />
          </View>

          {/* Event Date */}
          <View style={styles.section}>
            <Text style={styles.label}>Date</Text>
            <View style={styles.dateDisplay}>
              <Ionicons name="calendar-outline" size={20} color="#007AFF" />
              <Text style={styles.dateText}>
                {new Date(selectedDate).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </Text>
            </View>
          </View>

          {/* Event Time */}
          <View style={styles.section}>
            <Text style={styles.label}>Time *</Text>
            <TouchableOpacity 
              style={styles.timeButton}
              onPress={() => setShowTimePicker(true)}
            >
              <Ionicons name="time-outline" size={20} color="#007AFF" />
              <Text style={styles.timeText}>
                {selectedTime.toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })}
              </Text>
            </TouchableOpacity>

            {showTimePicker && (
              <DateTimePicker
                value={selectedTime}
                mode="time"
                is24Hour={false}
                onChange={handleTimeChange}
              />
            )}
          </View>

          {/* Event Type */}
          <View style={styles.section}>
            <Text style={styles.label}>Event Type</Text>
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeButton, type === 'in-person' && styles.typeButtonActive]}
                onPress={() => setType('in-person')}
              >
                <Ionicons 
                  name="location" 
                  size={20} 
                  color={type === 'in-person' ? 'white' : '#007AFF'} 
                />
                <Text style={[styles.typeButtonText, type === 'in-person' && styles.typeButtonTextActive]}>
                  In Person
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.typeButton, type === 'virtual' && styles.typeButtonActive]}
                onPress={() => setType('virtual')}
              >
                <Ionicons 
                  name="videocam" 
                  size={20} 
                  color={type === 'virtual' ? 'white' : '#007AFF'} 
                />
                <Text style={[styles.typeButtonText, type === 'virtual' && styles.typeButtonTextActive]}>
                  Virtual
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Location or Virtual Link */}
          {type === 'in-person' ? (
            <View style={styles.section}>
              <Text style={styles.label}>Location *</Text>
              <TextInput
                style={styles.input}
                value={location}
                onChangeText={setLocation}
                placeholder="Enter event location"
                multiline
              />
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.label}>Meeting Link *</Text>
              <TextInput
                style={styles.input}
                value={virtualLink}
                onChangeText={setVirtualLink}
                placeholder="Enter Zoom, Meet, or other video call link"
                keyboardType="url"
                autoCapitalize="none"
              />
            </View>
          )}

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Add event details, what to bring, etc."
              multiline
              numberOfLines={4}
              maxLength={500}
            />
          </View>

          {/* Event Image */}
          <View style={styles.section}>
            <Text style={styles.label}>Event Photo</Text>
            {image ? (
              <View style={styles.imageContainer}>
                <Image source={{ uri: image.uri }} style={styles.selectedImage} />
                <TouchableOpacity style={styles.removeImageButton} onPress={removeImage}>
                  <Ionicons name="close-circle" size={24} color="#ff3b30" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addImageButton} onPress={pickImage}>
                <Ionicons name="camera" size={24} color="#007AFF" />
                <Text style={styles.addImageText}>Add Photo</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.bottomPadding} />
        </ScrollView>
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
  cancelButton: {
    fontSize: 16,
    color: '#007AFF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d4150',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d4150',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#2d4150',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  dateText: {
    fontSize: 16,
    color: '#2d4150',
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  timeText: {
    fontSize: 16,
    color: '#2d4150',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  typeButtonActive: {
    backgroundColor: '#007AFF',
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#007AFF',
  },
  typeButtonTextActive: {
    color: 'white',
  },
  imageContainer: {
    position: 'relative',
  },
  selectedImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'white',
    borderRadius: 12,
  },
  addImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 20,
    gap: 8,
  },
  addImageText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  bottomPadding: {
    height: 40,
  },
});
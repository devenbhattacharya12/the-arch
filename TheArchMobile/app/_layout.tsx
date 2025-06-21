// app/_layout.tsx - The Arch Mobile App Layout
import React, { useState, useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

// CRITICAL: Configure notification handler at the very top, immediately after imports
//Notifications.setNotificationHandler({
  //handleNotification: async () => ({
    //shouldShowAlert: true,
    //shouldPlaySound: true,
    //shouldSetBadge: false,
  //}),
//});

// API Configuration - UPDATE THIS WITH YOUR IP ADDRESS
const API_BASE_URL = 'http://192.168.1.69:3000/api';

// API Service Class - Fixed Get-Togethers Methods
export class ApiService {
  static async request(endpoint: string, options: any = {}) {
    const token = await AsyncStorage.getItem('token');
    
    console.log('🔍 API Request:', {
      endpoint: `${API_BASE_URL}${endpoint}`,
      hasToken: !!token,
      method: options.method || 'GET',
      hasBody: !!options.body
    });

    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      ...options,
    };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
      
      // Log response details for debugging
      console.log('📡 Response Status:', response.status);
      console.log('📡 Response OK:', response.ok);
      
      // Handle different response types
      let data;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.log('⚠️ Non-JSON response:', text);
        data = { message: text };
      }
      
      if (!response.ok) {
        console.log('❌ API Error:', {
          status: response.status,
          statusText: response.statusText,
          data
        });
        throw new Error(data.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      console.log('✅ API Success:', endpoint);
      return data;
    } catch (error: any) {
      console.log('🚨 Network Error:', {
        message: error.message,
        endpoint,
        method: options.method || 'GET'
      });
      
      if (error.message.includes('Network request failed')) {
        throw new Error('Cannot connect to server. Check your WiFi connection and backend.');
      }
      
      throw error;
    }
  }

  // ==================== GET-TOGETHERS METHODS ====================

  // Get user's arches (for dropdown/selection)
  static async getUserArches() {
    console.log('🏛️ Getting user arches...');
    return this.request('/arches');
  }

  // Get get-togethers for a specific arch
  static async getGetTogethers(archId: string, month?: number, year?: number) {
    console.log('🎯 Getting get-togethers for arch:', archId);
    
    let endpoint = `/gettogethers/arch/${archId}`;
    if (month && year) {
      endpoint += `?month=${month}&year=${year}`;
      console.log('📅 With date filter:', { month, year });
    }
    
    return this.request(endpoint);
  }

  // Create a new get-together (with proper FormData handling)
  static async createGetTogether(getTogetherData: {
    archId: string;
    title: string;
    description?: string;
    type: 'in-person' | 'virtual';
    scheduledFor: string; // ISO date string
    location?: string;
    virtualLink?: string;
    image?: any; // File object from image picker
  }) {
    console.log('🎯 Creating get-together:', {
      ...getTogetherData,
      image: getTogetherData.image ? 'Image present' : 'No image'
    });

    const token = await AsyncStorage.getItem('token');
    
    // Create FormData for multipart/form-data
    const formData = new FormData();
    
    // Add all the text fields
    formData.append('archId', getTogetherData.archId);
    formData.append('title', getTogetherData.title);
    formData.append('type', getTogetherData.type);
    formData.append('scheduledFor', getTogetherData.scheduledFor);
    
    if (getTogetherData.description) {
      formData.append('description', getTogetherData.description);
    }
    
    if (getTogetherData.type === 'in-person' && getTogetherData.location) {
      formData.append('location', getTogetherData.location);
    }
    
    if (getTogetherData.type === 'virtual' && getTogetherData.virtualLink) {
      formData.append('virtualLink', getTogetherData.virtualLink);
    }
    
    // Add image if present
    if (getTogetherData.image) {
      // Handle different image formats (React Native vs Web)
      if (getTogetherData.image.uri) {
        // React Native image picker format
        formData.append('image', {
          uri: getTogetherData.image.uri,
          type: getTogetherData.image.type || 'image/jpeg',
          name: getTogetherData.image.fileName || 'image.jpg',
        } as any);
      } else if (getTogetherData.image instanceof File) {
        // Web File object
        formData.append('image', getTogetherData.image);
      }
    }

    console.log('📦 FormData prepared, sending request...');

    try {
      // Use fetch directly for FormData (don't set Content-Type - let browser handle it)
      const response = await fetch(`${API_BASE_URL}/gettogethers`, {
        method: 'POST',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
          // DON'T set Content-Type for FormData - browser will set it with boundary
        },
        body: formData,
      });

      console.log('📡 Create Response Status:', response.status);

      let data;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.log('⚠️ Non-JSON create response:', text);
        data = { message: text };
      }

      if (!response.ok) {
        console.log('❌ Create get-together failed:', data);
        throw new Error(data.message || 'Failed to create get-together');
      }

      console.log('✅ Get-together created successfully');
      return data;
    } catch (error: any) {
      console.error('❌ Error creating get-together:', error);
      throw error;
    }
  }

  // RSVP to a get-together (FIXED)
  static async rsvpToGetTogether(getTogetherId: string, status: 'accepted' | 'declined' | 'pending') {
    console.log('📝 RSVPing to get-together:', { getTogetherId, status });
    
    if (!getTogetherId) {
      throw new Error('Get-together ID is required');
    }
    
    if (!['accepted', 'declined', 'pending'].includes(status)) {
      throw new Error('Invalid RSVP status');
    }

    return this.request(`/gettogethers/${getTogetherId}/rsvp`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }

  // Get a specific get-together by ID
  static async getGetTogether(getTogetherId: string) {
    console.log('🔍 Getting specific get-together:', getTogetherId);
    
    if (!getTogetherId) {
      throw new Error('Get-together ID is required');
    }
    
    return this.request(`/gettogethers/${getTogetherId}`);
  }

  // Get RSVP summary for a get-together
  static async getGetTogetherRSVPSummary(getTogetherId: string) {
    console.log('📊 Getting RSVP summary for:', getTogetherId);
    
    if (!getTogetherId) {
      throw new Error('Get-together ID is required');
    }
    
    return this.request(`/gettogethers/${getTogetherId}/rsvp-summary`);
  }

  // Update a get-together (creator only)
  static async updateGetTogether(getTogetherId: string, updateData: {
    title?: string;
    description?: string;
    type?: 'in-person' | 'virtual';
    scheduledFor?: string;
    location?: string;
    virtualLink?: string;
    status?: 'planning' | 'active' | 'completed';
    image?: any;
  }) {
    console.log('✏️ Updating get-together:', getTogetherId, updateData);
    
    if (!getTogetherId) {
      throw new Error('Get-together ID is required');
    }

    const token = await AsyncStorage.getItem('token');
    
    // If there's an image, use FormData, otherwise use JSON
    if (updateData.image) {
      const formData = new FormData();
      
      // Add all update fields to FormData
      Object.entries(updateData).forEach(([key, value]) => {
        if (key === 'image' && value) {
          if (value.uri) {
            // React Native format
            formData.append('image', {
              uri: value.uri,
              type: value.type || 'image/jpeg',
              name: value.fileName || 'image.jpg',
            } as any);
          } else if (value instanceof File) {
            // Web File object
            formData.append('image', value);
          }
        } else if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });

      const response = await fetch(`${API_BASE_URL}/gettogethers/${getTogetherId}`, {
        method: 'PUT',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to update get-together');
      }
      return data;
    } else {
      // No image, use regular JSON request
      return this.request(`/gettogethers/${getTogetherId}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });
    }
  }

  // Delete a get-together (creator only)
  static async deleteGetTogether(getTogetherId: string) {
    console.log('🗑️ Deleting get-together:', getTogetherId);
    
    if (!getTogetherId) {
      throw new Error('Get-together ID is required');
    }
    
    return this.request(`/gettogethers/${getTogetherId}`, {
      method: 'DELETE',
    });
  }

  // Add timeline entry to a get-together
  static async addTimelineEntry(getTogetherId: string, entryData: {
    type: 'note' | 'photo' | 'video';
    content?: string;
    media?: any[]; // Array of media files
  }) {
    console.log('📝 Adding timeline entry:', getTogetherId, entryData);
    
    if (!getTogetherId) {
      throw new Error('Get-together ID is required');
    }

    const token = await AsyncStorage.getItem('token');
    const formData = new FormData();
    
    formData.append('type', entryData.type);
    if (entryData.content) {
      formData.append('content', entryData.content);
    }
    
    // Add media files if present
    if (entryData.media && entryData.media.length > 0) {
      entryData.media.forEach((mediaItem, index) => {
        if (mediaItem.uri) {
          // React Native format
          formData.append('media', {
            uri: mediaItem.uri,
            type: mediaItem.type || 'image/jpeg',
            name: mediaItem.fileName || `media_${index}.jpg`,
          } as any);
        } else if (mediaItem instanceof File) {
          // Web File object
          formData.append('media', mediaItem);
        }
      });
    }

    const response = await fetch(`${API_BASE_URL}/gettogethers/${getTogetherId}/timeline`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to add timeline entry');
    }
    return data;
  }

  // Utility method to get headers (you had this but it's useful to keep)
  static async getHeaders() {
    const token = await AsyncStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }


  // Push notification methods
  static async updatePushToken(token: string) {
    console.log('📱 Sending push token to backend...');
    return this.request('/auth/push-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  static async removePushToken() {
    return this.request('/auth/push-token', {
      method: 'DELETE',
    });
  }

  static async sendTestNotification() {
    return this.request('/auth/test-notification', {
      method: 'POST',
    });
  }

  // Auth methods
  static async login(email: string, password: string) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  static async register(name: string, email: string, password: string) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  }

  static async getCurrentUser() {
    return this.request('/auth/me');
  }

  // Arch methods
  static async getArches() {
    return this.request('/arches');
  }

  static async createArch(name: string, description: string) {
    return this.request('/arches', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  static async joinArch(inviteCode: string) {
    return this.request('/arches/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  }

  // Share a question response to the family feed
static async shareQuestionResponseToFeed(responseId: string) {
  return this.request(`/responses/${responseId}/share`, {
    method: 'POST',
  });
}

  // Questions methods
  static async getTodaysQuestions() {
    return this.request('/questions/today');
  }

  static async getQuestionsAboutMe() {
    return this.request('/questions/about-me');
  }

  static async submitQuestionResponse(questionId: string, response: string, sharedWithArch: boolean = false) {
    return this.request(`/questions/${questionId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ response, sharedWithArch }),
    });
  }

  static async passQuestion(questionId: string) {
    return this.request(`/questions/${questionId}/pass`, {
      method: 'POST',
    });
  }

  static async triggerDailyQuestions() {
    return this.request('/questions/trigger-daily', {
      method: 'POST',
    });
  }

  // Feed methods
  static async getArchFeed(archId: string, page: number = 1) {
    return this.request(`/posts/feed/${archId}?page=${page}&limit=20`);
  }

  static async createPost(archId: string, content: string, media: any[] = []) {
    return this.request('/posts', {
      method: 'POST',
      body: JSON.stringify({ archId, content, media }),
    });
  }

  static async togglePostLike(postId: string) {
    return this.request(`/posts/${postId}/like`, {
      method: 'POST',
    });
  }

  static async addPostComment(postId: string, content: string) {
    return this.request(`/posts/${postId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  
}

// Push notification registration function
export const registerForPushNotifications = async (): Promise<boolean> => {
  try {
    console.log('📱 Starting push notification registration...');
    
    if (!Device.isDevice) {
      console.log('❌ Must use physical device for Push Notifications');
      return false;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      console.log('📱 Requesting notification permissions...');
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('❌ Notification permissions denied');
      return false;
    }
    
    console.log('✅ Notification permissions granted');
    
    // Get push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'ea388a0c-9f65-4a3f-8c3c-e37b3e5e579a'
    });
    console.log('📱 Got push token:', tokenData.data.substring(0, 20) + '...');
    
    // Send to backend
    await ApiService.updatePushToken(tokenData.data);
    console.log('✅ Push token sent to backend');
    
    return true;
  } catch (error) {
    console.error('❌ Error registering for push notifications:', error);
    return false;
  }
};

// Auth Context Types
interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  login: (userData: User) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

// Create Auth Context
export const AuthContext = React.createContext<AuthContextType>({
  user: null,
  login: async () => {},
  logout: async () => {},
  loading: true,
});

// useAuth hook
export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Auth Provider Component
const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  // Check auth state on mount
  useEffect(() => {
    checkAuthState();
  }, []);

  

  // Handle navigation based on auth state
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(tabs)';
    
    console.log('🧭 Navigation check:', {
      hasUser: !!user,
      inAuthGroup,
      segments: segments.join('/'),
    });

    if (user && !inAuthGroup) {
      console.log('🏠 Redirecting to main app');
      router.replace('/(tabs)');
    } else if (!user && inAuthGroup) {
      console.log('🔐 Redirecting to login');
      router.replace('/login');
    }
  }, [user, segments, loading]);

  const checkAuthState = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const userData = await AsyncStorage.getItem('user');
      
      console.log('🔍 Checking auth state...');
      
      if (token && userData) {
        console.log('✅ User found in storage');
        setUser(JSON.parse(userData));
      } else {
        console.log('❌ No user found');
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (userData: User) => {
    console.log('🎉 User logged in:', userData.email);
    setUser(userData);
    
    // IMPORTANT: Register for push notifications after login
    console.log('📱 Starting push notification setup...');
    try {
      const success = await registerForPushNotifications();
      if (success) {
        console.log('✅ Push notifications registered successfully');
      } else {
        console.log('⚠️ Push notification registration failed - continuing anyway');
      }
    } catch (error) {
      console.error('❌ Push notification setup error:', error);
      console.log('ℹ️ App will continue without push notifications');
    }
  };

  const logout = async () => {
    console.log('👋 User logging out');
    
    try {
      await ApiService.removePushToken();
    } catch (error) {
      console.error('Error removing push token:', error);
    }
    
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Root Layout Component
export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

// Navigation Layout
function RootLayoutNav() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={{ 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: '#f8f9fa' 
      }}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="index" />
    </Stack>
  );
}
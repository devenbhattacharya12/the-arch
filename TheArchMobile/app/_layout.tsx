// app/_layout.tsx - Fixed Navigation
import React, { useState, useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View } from 'react-native';

// API Configuration - UPDATE THIS WITH YOUR IP ADDRESS
const API_BASE_URL = 'http://10.0.0.51:3000/api';

// API Service
export class ApiService {
  static async request(endpoint: string, options: any = {}) {
    const token = await AsyncStorage.getItem('token');
    
    // Debug logging
    console.log('🔍 API Request:', {
      endpoint: `${API_BASE_URL}${endpoint}`,
      hasToken: !!token,
      token: token ? token.substring(0, 20) + '...' : 'none'
    });

    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      ...options,
    };

    try {
      console.log('📡 Making request to:', `${API_BASE_URL}${endpoint}`);
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
      
      console.log('📨 Response status:', response.status);
      
      const data = await response.json();
      
      if (!response.ok) {
        console.log('❌ API Error:', data);
        throw new Error(data.message || 'Something went wrong');
      }
      
      console.log('✅ API Success:', endpoint);
      return data;
    } catch (error: any) {
      console.log('🚨 Network Error:', error.message);
      
      // More specific error messages
      if (error.message.includes('Network request failed')) {
        throw new Error('Cannot connect to server. Check your WiFi connection and backend.');
      } else if (error.message.includes('fetch')) {
        throw new Error(`Server not reachable at ${API_BASE_URL}`);
      }
      
      throw error;
    }
  }

  // Auth methods
  static async login(email: string, password: string) {
    console.log('🔐 Attempting login for:', email);
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  static async register(name: string, email: string, password: string) {
    console.log('📝 Attempting registration for:', email);
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
    console.log('🏠 Getting arches...');
    return this.request('/arches');
  }

  static async createArch(name: string, description: string) {
    console.log('🏗️ Creating arch:', name);
    return this.request('/arches', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  static async joinArch(inviteCode: string) {
    console.log('🔗 Joining arch with code:', inviteCode);
    return this.request('/arches/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  }

  // Daily Questions methods
  static async getTodaysQuestions() {
    console.log('📝 Getting today\'s questions...');
    return this.request('/questions/today');
  }

  static async getQuestionsAboutMe() {
    console.log('👤 Getting questions about me...');
    return this.request('/questions/about-me');
  }

  static async submitQuestionResponse(questionId: string, response: string, sharedWithArch: boolean = false) {
    console.log('💬 Submitting response for question:', questionId);
    return this.request(`/questions/${questionId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ response, sharedWithArch }),
    });
  }

  static async passQuestion(questionId: string) {
    console.log('⏭️ Passing question:', questionId);
    return this.request(`/questions/${questionId}/pass`, {
      method: 'POST',
    });
  }

  static async getArchQuestions(archId: string) {
    console.log('🏠 Getting arch questions...');
    return this.request(`/questions/arch/${archId}`);
  }

  static async getArchStats(archId: string) {
    console.log('📊 Getting arch stats...');
    return this.request(`/questions/arch/${archId}/stats`);
  }

  // TEMPORARY: For testing daily questions
  static async triggerDailyQuestions() {
    console.log('🔄 Triggering daily questions...');
    return this.request('/questions/trigger-daily', {
      method: 'POST',
    });
  }

  // Family Feed API methods
  static async getArchFeed(archId: string, page: number = 1) {
    console.log('📰 Getting feed for arch:', archId);
    return this.request(`/posts/feed/${archId}?page=${page}&limit=20`);
  }

  static async createPost(archId: string, content: string, media: any[] = []) {
    console.log('📝 Creating post in arch:', archId);
    return this.request('/posts', {
      method: 'POST',
      body: JSON.stringify({ archId, content, media }),
    });
  }

  static async togglePostLike(postId: string) {
    console.log('👍 Toggling like for post:', postId);
    return this.request(`/posts/${postId}/like`, {
      method: 'POST',
    });
  }

  static async addPostComment(postId: string, content: string) {
    console.log('💬 Adding comment to post:', postId);
    return this.request(`/posts/${postId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  static async deletePost(postId: string) {
    console.log('🗑️ Deleting post:', postId);
    return this.request(`/posts/${postId}`, {
      method: 'DELETE',
    });
  }

  static async getPostDetails(postId: string) {
    console.log('📄 Getting post details:', postId);
    return this.request(`/posts/${postId}`);
  }

  static async shareResponseToFeed(responseId: string) {
    console.log('📢 Sharing response to feed:', responseId);
    return this.request(`/posts/share-response/${responseId}`, {
      method: 'POST',
    });
  }
}

// Auth Context
interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  login: (userData: User) => void;
  logout: () => Promise<void>;
  loading: boolean;
}

export const AuthContext = React.createContext<AuthContextType>({
  user: null,
  login: () => {},
  logout: async () => {},
  loading: true,
});

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Updated Auth Provider with Navigation Logic
const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    checkAuthState();
  }, []);

  // Navigation effect - this is the key fix!
  useEffect(() => {
    if (loading) return; // Don't navigate while loading

    const inAuthGroup = segments[0] === '(tabs)';

    console.log('🧭 Navigation check:', {
      hasUser: !!user,
      inAuthGroup,
      segments: segments.join('/'),
    });

    if (user && !inAuthGroup) {
      // User is logged in but not in protected routes, redirect to tabs
      console.log('🏠 Redirecting to main app (tabs)');
      router.replace('/(tabs)');
    } else if (!user && inAuthGroup) {
      // User is not logged in but in protected routes, redirect to login
      console.log('🔐 Redirecting to login');
      router.replace('/login');
    }
  }, [user, segments, loading]);

  const checkAuthState = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const userData = await AsyncStorage.getItem('user');
      
      console.log('🔍 Checking auth state...');
      console.log('🎫 Token exists:', !!token);
      console.log('👤 User data exists:', !!userData);
      
      if (token && userData) {
        console.log('✅ User found in storage, auto-logging in');
        setUser(JSON.parse(userData));
      } else {
        console.log('❌ No user found, should show login screen');
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = (userData: User) => {
    console.log('🎉 User logged in:', userData.email);
    setUser(userData);
    // Navigation will be handled by the useEffect above
  };

  const logout = async () => {
    console.log('👋 User logging out');
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
    setUser(null);
    // Navigation will be handled by the useEffect above
  };

  const value = {
    user,
    login,
    logout,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' }}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  // Simplified layout - let the navigation logic in AuthProvider handle routing
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
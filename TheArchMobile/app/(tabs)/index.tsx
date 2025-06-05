// app/(tabs)/index.tsx - Arches Screen with Push Registration
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, ApiService } from '../_layout';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

interface Arch {
  _id: string;
  name: string;
  description?: string;
  members: any[];
  inviteCode: string;
}

export default function ArchesScreen() {
  const [arches, setArches] = useState<Arch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { logout } = useAuth();

  const loadArches = async () => {
    try {
      const archesData = await ApiService.getArches();
      setArches(archesData);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load arches');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadArches();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadArches();
  };

  const showCreateArchModal = () => {
    Alert.prompt(
      'Create New Arch',
      'Enter a name for your family arch:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async (archName) => {
            if (archName) {
              try {
                await ApiService.createArch(archName, '');
                loadArches();
              } catch (error: any) {
                Alert.alert('Error', error.message);
              }
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const showJoinArchModal = () => {
    Alert.prompt(
      'Join Arch',
      'Enter the invite code:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Join',
          onPress: async (inviteCode) => {
            if (inviteCode) {
              try {
                await ApiService.joinArch(inviteCode.toUpperCase());
                loadArches();
              } catch (error: any) {
                Alert.alert('Error', error.message);
              }
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', onPress: logout, style: 'destructive' },
      ]
    );
  };

  // NEW: Manual push notification registration
  const setupPushNotifications = async () => {
    try {
      console.log('📱 Manual push notification setup...');
      
      if (!Device.isDevice) {
        Alert.alert('Device Required', 'Push notifications only work on physical devices, not simulators.');
        return;
      }

      // Check/request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        console.log('📱 Requesting notification permissions...');
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        Alert.alert('Permissions Required', 'Please allow notifications in your device settings to receive family updates.');
        return;
      }
      
      console.log('✅ Notification permissions granted');
      
      // Get push token with project ID - using the ID from your EAS setup
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: 'a80f5ae7-529d-43f3-a235-f11bd7b74d5f'
      });
      console.log('📱 Got push token:', tokenData.data.substring(0, 20) + '...');
      
      // Send to backend
      await ApiService.updatePushToken(tokenData.data);
      console.log('✅ Push token sent to backend');
      
      Alert.alert('Success!', 'Push notifications are now set up! You should receive notifications for family activities.');
    } catch (error: any) {
      console.error('Manual push setup error:', error);
      Alert.alert('Error', `Failed to set up push notifications: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Loading your arches...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>The Arch</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color="#667eea" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.screenTitle}>My Family Arches</Text>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={showCreateArchModal}
          >
            <Ionicons name="add" size={24} color="#667eea" />
          </TouchableOpacity>
        </View>

        {arches.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="home-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>No Arches Yet</Text>
            <Text style={styles.emptySubtitle}>
              Create your first family arch or join an existing one
            </Text>
            <TouchableOpacity
              style={[styles.button, { marginTop: 20 }]}
              onPress={showCreateArchModal}
            >
              <Text style={styles.buttonText}>Create Your First Arch</Text>
            </TouchableOpacity>
          </View>
        ) : (
          arches.map((arch) => (
            <View key={arch._id} style={styles.archCard}>
              <Text style={styles.archName}>{arch.name}</Text>
              {arch.description && (
                <Text style={styles.archDescription}>{arch.description}</Text>
              )}
              <Text style={styles.archMembers}>
                {arch.members.length} member{arch.members.length !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.inviteCode}>
                Invite Code: {arch.inviteCode}
              </Text>
            </View>
          ))
        )}

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton, { marginTop: 20, marginBottom: 10 }]}
          onPress={showJoinArchModal}
        >
          <Text style={[styles.buttonText, { color: '#667eea' }]}>
            Join Existing Arch
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: '#28a745', marginTop: 10, marginBottom: 40 }]}
          onPress={async () => {
            try {
              console.log('🧪 Testing push notification...');
              await ApiService.sendTestNotification();
              Alert.alert('Success!', 'Test notification sent! Check your device in a few seconds.');
            } catch (error: any) {
              console.error('Test notification error:', error);
              Alert.alert('Error', `Failed to send test notification: ${error.message}`);
            }
          }}
        >
          <Text style={styles.buttonText}>
            🧪 Test Push Notification
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    backgroundColor: '#667eea',
    paddingHorizontal: 20,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  logoutButton: {
    padding: 5,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  headerButton: {
    padding: 8,
  },
  archCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  archName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  archDescription: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 10,
  },
  archMembers: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 5,
  },
  inviteCode: {
    fontSize: 12,
    color: '#667eea',
    fontFamily: 'monospace',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 15,
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#667eea',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#667eea',
  },
  loadingText: {
    marginTop: 10,
    color: '#6c757d',
    fontSize: 16,
  },
});
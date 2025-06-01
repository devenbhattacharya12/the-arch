// // services/NotificationService.ts - Complete Push Notification System
// import * as Notifications from 'expo-notifications';
// import * as Device from 'expo-device';
// import Constants from 'expo-constants';
// import { Platform } from 'react-native';
// import { ApiService } from '../app/_layout';

// // Configure notification behavior
// Notifications.setNotificationHandler({
//   handleNotification: async () => ({
//     shouldShowAlert: true,
//     shouldPlaySound: true,
//     shouldSetBadge: false,
//   }),
// });

// export interface NotificationData {
//   type: 'daily_question' | 'response_shared' | 'new_post' | 'comment' | 'like' | 'event';
//   title: string;
//   body: string;
//   data?: {
//     archId?: string;
//     postId?: string;
//     questionId?: string;
//     userId?: string;
//     [key: string]: any;
//   };
// }

// class NotificationService {
//   private expoPushToken: string | null = null;
//   private notificationListener: any = null;
//   private responseListener: any = null;

//   // Initialize notification system
//   async initialize(): Promise<boolean> {
//     try {
//       console.log('🔔 Initializing notifications...');
      
//       // Register for push notifications
//       const token = await this.registerForPushNotificationsAsync();
//       if (!token) {
//         console.log('❌ Failed to get push token');
//         return false;
//       }

//       this.expoPushToken = token;
//       console.log('✅ Push token obtained:', token.substring(0, 20) + '...');

//       // Send token to backend
//       await this.sendTokenToBackend(token);

//       // Set up notification listeners
//       this.setupNotificationListeners();

//       return true;
//     } catch (error) {
//       console.error('❌ Notification initialization failed:', error);
//       return false;
//     }
//   }

//   // Register for push notifications
//   private async registerForPushNotificationsAsync(): Promise<string | null> {
//     let token: string | null = null;

//     if (Platform.OS === 'android') {
//       Notifications.setNotificationChannelAsync('default', {
//         name: 'The Arch Notifications',
//         importance: Notifications.AndroidImportance.MAX,
//         vibrationPattern: [0, 250, 250, 250],
//         lightColor: '#667eea',
//       });
//     }

//     if (Device.isDevice) {
//       const { status: existingStatus } = await Notifications.getPermissionsAsync();
//       let finalStatus = existingStatus;
      
//       if (existingStatus !== 'granted') {
//         const { status } = await Notifications.requestPermissionsAsync();
//         finalStatus = status;
//       }
      
//       if (finalStatus !== 'granted') {
//         console.log('❌ Push notification permissions denied');
//         return null;
//       }
      
//       token = (
//         await Notifications.getExpoPushTokenAsync({
//           projectId: Constants.expoConfig?.extra?.eas?.projectId,
//         })
//       ).data;
//     } else {
//       console.log('❌ Must use physical device for push notifications');
//     }

//     return token;
//   }

//   // Send push token to backend
//   private async sendTokenToBackend(token: string): Promise<void> {
//     try {
//       await ApiService.updatePushToken(token);
//       console.log('✅ Push token sent to backend');
//     } catch (error) {
//       console.error('❌ Failed to send push token to backend:', error);
//     }
//   }

//   // Set up notification listeners
//   private setupNotificationListeners(): void {
//     // Listener for notifications received while app is running
//     this.notificationListener = Notifications.addNotificationReceivedListener(
//       (notification) => {
//         console.log('🔔 Notification received:', notification);
//         this.handleNotificationReceived(notification);
//       }
//     );

//     // Listener for notification taps
//     this.responseListener = Notifications.addNotificationResponseReceivedListener(
//       (response) => {
//         console.log('👆 Notification tapped:', response);
//         this.handleNotificationTap(response);
//       }
//     );
//   }

//   // Handle notification received while app is open
//   private handleNotificationReceived(notification: Notifications.Notification): void {
//     const { type, data } = notification.request.content.data as any;
    
//     // You can add custom in-app handling here
//     // For example, update badge counts, show in-app alerts, etc.
    
//     console.log('📱 Handling notification type:', type);
//   }

//   // Handle notification tap (opens app)
//   private handleNotificationTap(response: Notifications.NotificationResponse): void {
//     const { type, data } = response.notification.request.content.data as any;
    
//     // Navigate to appropriate screen based on notification type
//     this.navigateFromNotification(type, data);
//   }

//   // Navigate to appropriate screen
//   private navigateFromNotification(type: string, data: any): void {
//     // This will be implemented with your navigation system
//     // For now, we'll just log what would happen
    
//     switch (type) {
//       case 'daily_question':
//         console.log('🔔 Navigate to Daily Questions tab');
//         // router.push('/(tabs)/questions');
//         break;
        
//       case 'response_shared':
//         console.log('🔔 Navigate to Questions About Me tab');
//         // router.push('/(tabs)/questions?tab=about-me');
//         break;
        
//       case 'new_post':
//       case 'comment':
//       case 'like':
//         console.log('🔔 Navigate to Family Feed');
//         // router.push('/(tabs)/feed');
//         break;
        
//       case 'event':
//         console.log('🔔 Navigate to Events tab');
//         // router.push('/(tabs)/events');
//         break;
        
//       default:
//         console.log('🔔 Navigate to main app');
//         // router.push('/(tabs)');
//     }
//   }

//   // Schedule local notification (for testing)
//   async scheduleLocalNotification(notificationData: NotificationData): Promise<void> {
//     try {
//       await Notifications.scheduleNotificationAsync({
//         content: {
//           title: notificationData.title,
//           body: notificationData.body,
//           data: { type: notificationData.type, ...notificationData.data },
//           sound: true,
//         },
//         trigger: { seconds: 1 },
//       });
      
//       console.log('🔔 Local notification scheduled');
//     } catch (error) {
//       console.error('❌ Failed to schedule local notification:', error);
//     }
//   }

//   // Test notification (for development)
//   async sendTestNotification(): Promise<void> {
//     const testNotifications = [
//       {
//         type: 'daily_question' as const,
//         title: '🌅 Good morning!',
//         body: 'Your daily questions are ready to answer',
//         data: { archId: 'test123' }
//       },
//       {
//         type: 'response_shared' as const,
//         title: '💝 Someone shared about you!',
//         body: 'Mom shared something beautiful about you',
//         data: { questionId: 'q123', userId: 'user123' }
//       },
//       {
//         type: 'new_post' as const,
//         title: '📱 New family post',
//         body: 'Dad shared a new update in the family feed',
//         data: { postId: 'post123', archId: 'arch123' }
//       }
//     ];

//     const randomNotification = testNotifications[Math.floor(Math.random() * testNotifications.length)];
//     await this.scheduleLocalNotification(randomNotification);
//   }

//   // Get current push token
//   getPushToken(): string | null {
//     return this.expoPushToken;
//   }

//   // Clean up listeners
//   cleanup(): void {
//     if (this.notificationListener) {
//       Notifications.removeNotificationSubscription(this.notificationListener);
//     }
//     if (this.responseListener) {
//       Notifications.removeNotificationSubscription(this.responseListener);
//     }
//   }

//   // Check notification permissions
//   async checkPermissions(): Promise<boolean> {
//     const { status } = await Notifications.getPermissionsAsync();
//     return status === 'granted';
//   }

//   // Request notification permissions
//   async requestPermissions(): Promise<boolean> {
//     const { status } = await Notifications.requestPermissionsAsync();
//     return status === 'granted';
//   }

//   // Get notification settings info
//   async getNotificationSettings(): Promise<any> {
//     const permissions = await Notifications.getPermissionsAsync();
//     return {
//       granted: permissions.status === 'granted',
//       token: this.expoPushToken,
//       settings: permissions
//     };
//   }
// }

// // Export singleton instance
// export const notificationService = new NotificationService();
// export default NotificationService;
// app/index.tsx - Simplified
import { Redirect } from 'expo-router';
import { useAuth } from './_layout';

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return null; // Let the layout handle loading
  }

  // Let the AuthProvider handle navigation, just provide a fallback
  return user ? <Redirect href="/(tabs)" /> : <Redirect href="/login" />;
}
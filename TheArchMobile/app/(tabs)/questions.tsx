// app/(tabs)/questions.tsx - Daily Questions Screen with Feed Sharing
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiService } from '../_layout';

interface DailyQuestion {
  _id: string;
  question: string;
  aboutUser: {
    _id: string;
    name: string;
    email: string;
  };
  arch: {
    _id: string;
    name: string;
  };
  deadline: string;
  responses: Array<{
    _id: string;
    user: {
      _id: string;
      name: string;
    };
    response: string;
    passed: boolean;
    submittedAt: string;
    sharedWithArch?: boolean;
  }>;
  processed: boolean;
}

export default function QuestionsScreen() {
  const [todayQuestions, setTodayQuestions] = useState<DailyQuestion[]>([]);
  const [aboutMeQuestions, setAboutMeQuestions] = useState<DailyQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [responses, setResponses] = useState<{ [key: string]: string }>({});
  const [submitting, setSubmitting] = useState<{ [key: string]: boolean }>({});
  const [activeTab, setActiveTab] = useState<'answer' | 'about-me'>('answer');

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    try {
      console.log('📝 Loading daily questions...');
      const [todayData, aboutMeData] = await Promise.all([
        ApiService.getTodaysQuestions(),
        ApiService.getQuestionsAboutMe(),
      ]);
      
      setTodayQuestions(todayData);
      setAboutMeQuestions(aboutMeData);
      
      console.log(`✅ Loaded ${todayData.length} questions to answer, ${aboutMeData.length} about me`);
    } catch (error: any) {
      console.error('❌ Error loading questions:', error);
      Alert.alert('Error', 'Failed to load questions: ' + error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadQuestions();
  };

  const submitResponse = async (questionId: string, response: string) => {
    if (!response.trim()) {
      Alert.alert('Error', 'Please enter a response');
      return;
    }

    setSubmitting(prev => ({ ...prev, [questionId]: true }));
    
    try {
      console.log(`💬 Submitting response for question ${questionId}`);
      await ApiService.submitQuestionResponse(questionId, response.trim());
      
      // Clear the response input
      setResponses(prev => ({ ...prev, [questionId]: '' }));
      
      // Reload questions to show updated state
      await loadQuestions();
      
      Alert.alert('Success', 'Your response has been submitted!');
    } catch (error: any) {
      console.error('❌ Error submitting response:', error);
      Alert.alert('Error', 'Failed to submit response: ' + error.message);
    } finally {
      setSubmitting(prev => ({ ...prev, [questionId]: false }));
    }
  };

  const passQuestion = async (questionId: string) => {
    Alert.alert(
      'Pass Question',
      'Are you sure you want to pass on this question? You can\'t change this later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pass',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log(`⏭️ Passing question ${questionId}`);
              await ApiService.passQuestion(questionId);
              await loadQuestions();
              Alert.alert('Question Passed', 'You\'ve passed on this question.');
            } catch (error: any) {
              console.error('❌ Error passing question:', error);
              Alert.alert('Error', 'Failed to pass question: ' + error.message);
            }
          },
        },
      ]
    );
  };

  const shareResponseToFeed = async (responseId: string) => {
    try {
      console.log('📢 Sharing response to feed:', responseId);
      await ApiService.shareResponseToFeed(responseId);
      Alert.alert('Success', 'Response shared to family feed!');
      // Reload questions to show updated share status
      await loadQuestions();
    } catch (error: any) {
      console.error('❌ Error sharing response:', error);
      Alert.alert('Error', 'Failed to share response: ' + error.message);
    }
  };

  const formatDeadline = (deadline: string) => {
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const diffHours = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60));
    
    if (diffHours <= 0) {
      return 'Deadline passed';
    } else if (diffHours === 1) {
      return '1 hour left';
    } else {
      return `${diffHours} hours left`;
    }
  };

  const hasUserResponded = (question: DailyQuestion, userId?: string) => {
    // For now, we'll assume current user has responded if there's any response
    // You might want to pass the current user ID to check properly
    return question.responses.length > 0;
  };

  const renderQuestion = (question: DailyQuestion, isAboutMe: boolean = false) => {
    const userResponded = hasUserResponded(question);
    const isPastDeadline = new Date(question.deadline) < new Date();
    
    return (
      <View key={question._id} style={styles.questionCard}>
        <View style={styles.questionHeader}>
          <View style={styles.questionInfo}>
            <Text style={styles.archName}>{question.arch.name}</Text>
            <Text style={styles.deadlineText}>
              {formatDeadline(question.deadline)}
            </Text>
          </View>
          {!isAboutMe && !userResponded && !isPastDeadline && (
            <TouchableOpacity
              onPress={() => passQuestion(question._id)}
              style={styles.passButton}
            >
              <Ionicons name="arrow-forward" size={16} color="#6c757d" />
              <Text style={styles.passButtonText}>Pass</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.questionText}>
          {question.question}
        </Text>

        {isAboutMe ? (
          <View style={styles.aboutMeSection}>
            <Text style={styles.aboutMeLabel}>
              Family members are sharing what they appreciate about you ❤️
            </Text>
            {question.responses.length > 0 && question.processed ? (
              <View style={styles.responsesSection}>
                {question.responses
                  .filter(r => !r.passed && r.response)
                  .map((response, index) => (
                    <View key={index} style={styles.responseItem}>
                      <Text style={styles.responseText}>"{response.response}"</Text>
                      <Text style={styles.responseAuthor}>- {response.user.name}</Text>
                      
                      {/* Share to Feed Button */}
                      <View style={styles.responseActions}>
                        {response.sharedWithArch ? (
                          <View style={styles.sharedIndicator}>
                            <Ionicons name="checkmark-circle" size={16} color="#28a745" />
                            <Text style={styles.sharedText}>Shared to family feed</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.shareButton}
                            onPress={() => shareResponseToFeed(response._id)}
                          >
                            <Ionicons name="share-outline" size={16} color="#667eea" />
                            <Text style={styles.shareButtonText}>Share with Family</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
              </View>
            ) : (
              <Text style={styles.waitingText}>
                {question.processed 
                  ? 'No responses shared yet' 
                  : 'Responses will be shared after 5 PM ET'}
              </Text>
            )}
          </View>
        ) : (
          <>
            {userResponded ? (
              <View style={styles.completedSection}>
                <Ionicons name="checkmark-circle" size={20} color="#28a745" />
                <Text style={styles.completedText}>Response submitted!</Text>
              </View>
            ) : isPastDeadline ? (
              <View style={styles.expiredSection}>
                <Ionicons name="time-outline" size={20} color="#dc3545" />
                <Text style={styles.expiredText}>Question expired</Text>
              </View>
            ) : (
              <View style={styles.responseSection}>
                <TextInput
                  style={styles.responseInput}
                  placeholder={`Share something you appreciate about ${question.aboutUser.name}...`}
                  value={responses[question._id] || ''}
                  onChangeText={(text) => 
                    setResponses(prev => ({ ...prev, [question._id]: text }))
                  }
                  multiline
                  numberOfLines={3}
                />
                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    (!responses[question._id]?.trim() || submitting[question._id]) && 
                    styles.submitButtonDisabled
                  ]}
                  onPress={() => submitResponse(question._id, responses[question._id] || '')}
                  disabled={!responses[question._id]?.trim() || submitting[question._id]}
                >
                  {submitting[question._id] ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Ionicons name="send" size={16} color="white" />
                      <Text style={styles.submitButtonText}>Submit</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Loading today's questions...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Daily Questions</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'answer' && styles.activeTab]}
          onPress={() => setActiveTab('answer')}
        >
          <Text style={[styles.tabText, activeTab === 'answer' && styles.activeTabText]}>
            Answer ({todayQuestions.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'about-me' && styles.activeTab]}
          onPress={() => setActiveTab('about-me')}
        >
          <Text style={[styles.tabText, activeTab === 'about-me' && styles.activeTabText]}>
            About Me ({aboutMeQuestions.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* TEST BUTTON - Remove this in production */}
      <TouchableOpacity
        style={styles.testButton}
        onPress={async () => {
          try {
            await ApiService.triggerDailyQuestions();
            Alert.alert('Success', 'Daily questions created!');
            loadQuestions();
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
        }}
      >
        <Text style={styles.testButtonText}>
          🧪 Create Test Questions
        </Text>
      </TouchableOpacity>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {activeTab === 'answer' ? (
          todayQuestions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="help-circle-outline" size={64} color="#ccc" />
              <Text style={styles.emptyTitle}>No Questions Today</Text>
              <Text style={styles.emptySubtitle}>
                New questions will appear at 6 AM ET each day
              </Text>
            </View>
          ) : (
            todayQuestions.map(question => renderQuestion(question, false))
          )
        ) : (
          aboutMeQuestions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="heart-outline" size={64} color="#ccc" />
              <Text style={styles.emptyTitle}>No Questions About You</Text>
              <Text style={styles.emptySubtitle}>
                When family members answer questions about you, they'll appear here
              </Text>
            </View>
          ) : (
            aboutMeQuestions.map(question => renderQuestion(question, true))
          )
        )}
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
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#667eea',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6c757d',
  },
  activeTabText: {
    color: '#667eea',
  },
  testButton: {
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 10,
    margin: 20,
    alignItems: 'center',
  },
  testButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  questionCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  questionInfo: {
    flex: 1,
  },
  archName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#667eea',
    marginBottom: 2,
  },
  deadlineText: {
    fontSize: 12,
    color: '#6c757d',
  },
  passButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  passButtonText: {
    fontSize: 12,
    color: '#6c757d',
    marginLeft: 4,
  },
  questionText: {
    fontSize: 18,
    lineHeight: 26,
    color: '#333',
    marginBottom: 20,
  },
  responseSection: {
    gap: 15,
  },
  responseInput: {
    borderWidth: 1,
    borderColor: '#e1e5e9',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#667eea',
    borderRadius: 10,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  completedSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#d4edda',
    borderRadius: 10,
    gap: 10,
  },
  completedText: {
    color: '#155724',
    fontSize: 16,
    fontWeight: '500',
  },
  expiredSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f8d7da',
    borderRadius: 10,
    gap: 10,
  },
  expiredText: {
    color: '#721c24',
    fontSize: 16,
    fontWeight: '500',
  },
  aboutMeSection: {
    gap: 15,
  },
  aboutMeLabel: {
    fontSize: 14,
    color: '#667eea',
    fontWeight: '500',
    textAlign: 'center',
    padding: 10,
    backgroundColor: '#f0f4ff',
    borderRadius: 8,
  },
  responsesSection: {
    gap: 15,
  },
  responseItem: {
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
  },
  responseText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#333',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  responseAuthor: {
    fontSize: 14,
    color: '#6c757d',
    fontWeight: '500',
    marginBottom: 10,
  },
  responseActions: {
    marginTop: 10,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f0f4ff',
    borderRadius: 20,
    alignSelf: 'flex-start',
    gap: 6,
  },
  shareButtonText: {
    fontSize: 12,
    color: '#667eea',
    fontWeight: '500',
  },
  sharedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#d4edda',
    borderRadius: 20,
    alignSelf: 'flex-start',
    gap: 6,
  },
  sharedText: {
    fontSize: 12,
    color: '#28a745',
    fontWeight: '500',
  },
  waitingText: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    padding: 20,
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    marginTop: 50,
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
  loadingText: {
    marginTop: 10,
    color: '#6c757d',
    fontSize: 16,
  },
});
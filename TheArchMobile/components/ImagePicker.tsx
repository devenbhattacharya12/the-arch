// components/ImagePicker.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  ScrollView
} from 'react-native';
import * as ImagePickerExpo from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

interface ImageData {
  uri: string;
  type: string;
  name: string;
  size?: number;
}

interface ImagePickerProps {
  onImagesSelected: (images: ImageData[]) => void;
  maxImages?: number;
}

const ImagePicker: React.FC<ImagePickerProps> = ({ onImagesSelected, maxImages = 5 }) => {
  const [selectedImages, setSelectedImages] = useState<ImageData[]>([]);

  const selectImage = () => {
    Alert.alert(
      'Select Image',
      'Choose an option',
      [
        { text: 'Camera', onPress: () => openCamera() },
        { text: 'Gallery', onPress: () => openGallery() },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const requestPermissions = async () => {
    const { status: cameraStatus } = await ImagePickerExpo.requestCameraPermissionsAsync();
    const { status: libraryStatus } = await ImagePickerExpo.requestMediaLibraryPermissionsAsync();
    
    if (cameraStatus !== 'granted' || libraryStatus !== 'granted') {
      Alert.alert('Permission needed', 'Camera and photo library access is required to add photos.');
      return false;
    }
    return true;
  };

  const openCamera = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePickerExpo.launchCameraAsync({
    mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0]);
    }
  };

  const openGallery = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePickerExpo.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: maxImages - selectedImages.length,
      quality: 0.8,
    });

    if (!result.canceled) {
      for (const asset of result.assets) {
        await processImage(asset);
      }
    }
  };

  const processImage = async (asset: any) => {
    try {
      // Resize image to reduce file size
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      const imageData: ImageData = {
        uri: manipulatedImage.uri,
        type: 'image/jpeg',
        name: `image_${Date.now()}.jpg`,
      };

      const updatedImages = [...selectedImages, imageData].slice(0, maxImages);
      setSelectedImages(updatedImages);
      onImagesSelected(updatedImages);
    } catch (error) {
      console.error('Error processing image:', error);
      Alert.alert('Error', 'Failed to process image');
    }
  };

  const removeImage = (index: number) => {
    const updatedImages = selectedImages.filter((_, i) => i !== index);
    setSelectedImages(updatedImages);
    onImagesSelected(updatedImages);
  };

  return (
    <View style={styles.container}>
      {selectedImages.length > 0 && (
        <ScrollView horizontal style={styles.imagePreview}>
          {selectedImages.map((image, index) => (
            <View key={index} style={styles.imageContainer}>
              <Image source={{ uri: image.uri }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeImage(index)}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
      
      {selectedImages.length < maxImages && (
        <TouchableOpacity style={styles.selectButton} onPress={selectImage}>
          <Text style={styles.selectButtonText}>
            {selectedImages.length === 0 ? '📷 Add Photos' : '+ Add More'}
          </Text>
        </TouchableOpacity>
      )}
      
      {selectedImages.length > 0 && (
        <Text style={styles.imageCount}>
          {selectedImages.length}/{maxImages} photos selected
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  imagePreview: {
    marginBottom: 10,
  },
  imageContainer: {
    position: 'relative',
    marginRight: 10,
  },
  previewImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF4444',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  selectButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  selectButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  imageCount: {
    textAlign: 'center',
    color: '#666',
    fontSize: 12,
    marginTop: 5,
  },
});

export default ImagePicker;
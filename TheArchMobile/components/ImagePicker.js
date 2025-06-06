// components/ImagePicker.js
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
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import ImageResizer from 'react-native-image-resizer';

const ImagePicker = ({ onImagesSelected, maxImages = 5 }) => {
  const [selectedImages, setSelectedImages] = useState([]);

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

  const openCamera = () => {
    const options = {
      mediaType: 'photo',
      quality: 0.8,
      maxWidth: 1200,
      maxHeight: 1200
    };

    launchCamera(options, handleImageResponse);
  };

  const openGallery = () => {
    const options = {
      mediaType: 'photo',
      quality: 0.8,
      maxWidth: 1200,
      maxHeight: 1200,
      selectionLimit: maxImages - selectedImages.length
    };

    launchImageLibrary(options, handleImageResponse);
  };

  const handleImageResponse = async (response) => {
    if (response.didCancel || response.errorMessage) {
      return;
    }

    const assets = response.assets || [response];
    const newImages = [];

    for (const asset of assets) {
      try {
        // Resize image to reduce file size
        const resizedImage = await ImageResizer.createResizedImage(
          asset.uri,
          1200,
          1200,
          'JPEG',
          80
        );

        const imageData = {
          uri: resizedImage.uri,
          type: 'image/jpeg',
          name: asset.fileName || `image_${Date.now()}.jpg`,
          size: resizedImage.size
        };

        newImages.push(imageData);
      } catch (error) {
        console.error('Error resizing image:', error);
        // Use original if resize fails
        newImages.push({
          uri: asset.uri,
          type: asset.type,
          name: asset.fileName || `image_${Date.now()}.jpg`,
          size: asset.fileSize
        });
      }
    }

    const updatedImages = [...selectedImages, ...newImages].slice(0, maxImages);
    setSelectedImages(updatedImages);
    onImagesSelected(updatedImages);
  };

  const removeImage = (index) => {
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
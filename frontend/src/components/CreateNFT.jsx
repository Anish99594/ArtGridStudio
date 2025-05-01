import { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { ArrowRight, Check, Image, Upload, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { SignJWT } from 'jose';
import './CreateNFT.css';
import artGridStudioABI from '../../abis/ArtGridStudio.json';

const TierCard = ({ tier, index, handleTierChange, handleImageChange, previewUrls }) => {
  const tierColors = {
    0: {
      borderColor: '#CD7F32',
      bgColor: 'rgba(205, 127, 50, 0.05)',
      label: 'Bronze'
    },
    1: {
      borderColor: '#C0C0C0',
      bgColor: 'rgba(192, 192, 192, 0.05)',
      label: 'Silver'
    },
    2: {
      borderColor: '#FFD700',
      bgColor: 'rgba(255, 215, 0, 0.05)',
      label: 'Gold'
    }
  };

  const getBackgroundStyle = () => {
    const color = tierColors[index].borderColor;
    return {
      borderLeft: `4px solid ${color}`,
      background: `linear-gradient(90deg, ${tierColors[index].bgColor} 0%, rgba(22, 22, 26, 0) 100%)`
    };
  };

  return (
    <div className="tier-card" style={getBackgroundStyle()}>
      <div className="tier-header">
        <div className="tier-badge" style={{ background: tierColors[index].borderColor }}>
          {tierColors[index].label}
        </div>
        <h4>{tier.name} Tier</h4>
      </div>
      
      <div className="tier-content">
        <div className="tier-image-upload">
          <label htmlFor={`tier-image-${index}`} className="image-upload-area">
            {previewUrls[index] ? (
              <div className="preview-container">
                <img src={previewUrls[index]} alt={`${tier.name} Preview`} />
                <div className="preview-overlay">
                  <div className="change-image-text">Change Image</div>
                </div>
              </div>
            ) : (
              <div className="upload-placeholder">
                <Image size={48} className="upload-icon" />
                <span>Upload Tier Image</span>
                <small>JPEG or PNG, max 10MB</small>
              </div>
            )}
            <input
              type="file"
              id={`tier-image-${index}`}
              accept="image/jpeg,image/png"
              onChange={(e) => handleImageChange(e, index)}
              required
              className="hidden-input"
            />
          </label>
        </div>
        
        <div className="tier-form-content">
          <div className="tier-requirements">
            <div className="requirement-item">
              <label>Likes Required</label>
              <input
                type="number"
                min="0"
                value={tier.likesRequired}
                onChange={(e) => handleTierChange(index, 'likesRequired', e.target.value)}
                required
              />
            </div>
            <div className="requirement-item">
              <label>Comments Required</label>
              <input
                type="number"
                min="0"
                value={tier.commentsRequired}
                onChange={(e) => handleTierChange(index, 'commentsRequired', e.target.value)}
                required
              />
            </div>
            <div className="requirement-item">
              <label>LYX Stake Required</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={tier.lyxStakeRequired}
                onChange={(e) => handleTierChange(index, 'lyxStakeRequired', e.target.value)}
                required
              />
            </div>
          </div>
          
          <div className="tier-description-field">
            <label>Tier Description</label>
            <input
              type="text"
              placeholder="Describe unique benefits of this tier"
              value={tier.description}
              onChange={(e) => handleTierChange(index, 'description', e.target.value)}
              required
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const CreateNFT = ({ address, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '0.5',
    tiers: [
      {
        likesRequired: 10,
        commentsRequired: 5,
        lyxStakeRequired: 0.1,
        name: 'Bronze',
        description: 'Entry tier with basic perks',
        image: null,
      },
      {
        likesRequired: 20,
        commentsRequired: 10,
        lyxStakeRequired: 0.5,
        name: 'Silver',
        description: 'Enhanced tier with additional benefits',
        image: null,
      },
      {
        likesRequired: 50,
        commentsRequired: 20,
        lyxStakeRequired: 1,
        name: 'Gold',
        description: 'Premium tier with exclusive rewards',
        image: null,
      },
    ],
  });

  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [previewUrls, setPreviewUrls] = useState(['', '', '']);
  const [formErrors, setFormErrors] = useState({});

  const { writeContractAsync } = useWriteContract();
  const { waitForTransactionReceipt } = useWaitForTransactionReceipt();

  useEffect(() => {
    // Add entrance animations when component mounts
    const timer = setTimeout(() => {
      document.querySelector('.create-nft-container').classList.add('visible');
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  const validateStep = (step) => {
    const errors = {};

    if (step === 1) {
      if (!formData.name.trim()) errors.name = "NFT name is required";
      if (!formData.description.trim()) errors.description = "Description is required";
      if (!formData.price || Number(formData.price) <= 0) errors.price = "Valid price is required";
    }
    
    if (step === 2) {
      formData.tiers.forEach((tier, index) => {
        if (!tier.image) errors[`tier${index}Image`] = `Image for ${tier.name} tier is required`;
        if (!tier.description.trim()) errors[`tier${index}Description`] = `Description for ${tier.name} tier is required`;
      });
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
      
      // Scroll to top of form when changing steps
      document.querySelector('.create-nft-container').scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleImageChange = (e, tierIndex) => {
    const file = e.target.files[0];
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Only JPEG or PNG images are allowed');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size exceeds 10MB limit');
        return;
      }
      const otherTiers = formData.tiers.filter((_, idx) => idx !== tierIndex);
      if (otherTiers.some((tier) => tier.image?.name === file.name)) {
        toast.error('Each tier must have a unique image');
        return;
      }
      console.log(`Selected image for tier ${tierIndex} (${formData.tiers[tierIndex].name}):`, file.name, file.size);
      const updatedTiers = [...formData.tiers];
      updatedTiers[tierIndex] = { ...updatedTiers[tierIndex], image: file };
      setFormData({ ...formData, tiers: updatedTiers });

      // Clear any errors
      const newErrors = {...formErrors};
      delete newErrors[`tier${tierIndex}Image`];
      setFormErrors(newErrors);

      const reader = new FileReader();
      reader.onload = () => {
        const updatedPreviews = [...previewUrls];
        updatedPreviews[tierIndex] = reader.result;
        setPreviewUrls(updatedPreviews);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
    
    // Clear error for this field if it exists
    if (formErrors[name]) {
      const newErrors = {...formErrors};
      delete newErrors[name];
      setFormErrors(newErrors);
    }
  };

  const handleTierChange = (index, field, value) => {
    const updatedTiers = [...formData.tiers];
    updatedTiers[index] = {
      ...updatedTiers[index],
      [field]: field === 'lyxStakeRequired' || field === 'description' ? value : Number(value),
    };
    setFormData({
      ...formData,
      tiers: updatedTiers,
    });
    
    // Clear error for this field if it exists
    if (formErrors[`tier${index}${field}`]) {
      const newErrors = {...formErrors};
      delete newErrors[`tier${index}${field}`];
      setFormErrors(newErrors);
    }
  };

  const generateJwt = async () => {
    const sharedSecret = import.meta.env.VITE_SHARED_SECRET;
    if (!sharedSecret) {
      throw new Error('Shared secret not configured');
    }
    try {
      const secret = new TextEncoder().encode(sharedSecret);
      const token = await new SignJWT({ sub: 'nft-upload' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(secret);
      return token;
    } catch (error) {
      console.error('Failed to generate JWT:', error);
      throw new Error('JWT generation failed');
    }
  };

  const uploadToDrive = async (fileOrJson, fileName, isJson = false) => {
    try {
      const workerUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8787';
      let jwt;
      try {
        jwt = await generateJwt();
      } catch (error) {
        console.error('Failed to generate JWT:', error);
        throw new Error('JWT generation failed');
      }

      let fileContent;
      let mimeType;
      if (isJson) {
        fileContent = btoa(JSON.stringify(fileOrJson));
        mimeType = 'application/json';
      } else {
        const arrayBuffer = await fileOrJson.arrayBuffer();
        fileContent = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        mimeType = fileOrJson.type;
      }

      console.log(`Uploading ${isJson ? 'JSON' : 'image'} to Google Drive: ${fileName}`);

      const response = await fetch(`${workerUrl}/upload-to-drive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          fileName,
          fileContent,
          mimeType,
          isJson,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload to Google Drive: ${response.status} ${response.statusText}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`Google Drive upload result for ${fileName}:`, result);
      return { fileId: result.fileId, shareableLink: result.shareableLink };
    } catch (error) {
      console.error(`Error uploading ${isJson ? 'JSON' : 'image'} to Google Drive:`, error);
      throw error;
    }
  };

  const generateTierMetadata = async () => {
    try {
      const metadataUrls = [];
      const uploadedImageIds = new Set();
      console.log('Starting metadata generation for tiers:', formData.tiers);
  
      for (let i = 0; i < formData.tiers.length; i++) {
        const tier = formData.tiers[i];
        let imageResult;
  
        if (!tier.image) {
          throw new Error(`No image provided for tier ${tier.name}`);
        }
  
        console.log(`Uploading image for tier ${tier.name}: ${tier.image.name}`);
        try {
          imageResult = await uploadToDrive(tier.image, `${formData.name}_${tier.name}_image.${tier.image.name.split('.').pop()}`);
          console.log(`Tier ${tier.name} Image File ID: ${imageResult.fileId}, Shareable Link: ${imageResult.shareableLink}`);
        } catch (error) {
          console.error(`Failed to upload image for tier ${tier.name}:`, error);
          throw new Error(`Image upload failed for tier ${tier.name}: ${error.message}`);
        }
  
        if (uploadedImageIds.has(imageResult.fileId)) {
          throw new Error(`Duplicate image file ID detected for tier ${tier.name}: ${imageResult.fileId}`);
        }
        uploadedImageIds.add(imageResult.fileId);
  
        const metadata = {
          name: `${formData.name} - ${tier.name}`,
          description: `${formData.description} - ${tier.description}`,
          tier: tier.name,
          image: imageResult.shareableLink,
          attributes: [
            { trait_type: 'Tier', value: tier.name },
            { trait_type: 'Likes Required', value: tier.likesRequired },
            { trait_type: 'Comments Required', value: tier.commentsRequired },
            { trait_type: 'LYX Stake Required', value: tier.lyxStakeRequired },
          ],
        };
  
        console.log(`Generated metadata for tier ${tier.name}:`, JSON.stringify(metadata, null, 2));
        let metadataResult;
        try {
          metadataResult = await uploadToDrive(metadata, `${formData.name}_${tier.name}_metadata.json`, true);
          console.log(`Tier ${tier.name} Metadata File ID: ${metadataResult.fileId}, Shareable Link: ${metadataResult.shareableLink}`);
        } catch (error) {
          console.error(`Failed to upload metadata for tier ${tier.name}:`, error);
          throw new Error(`Metadata upload failed for tier ${tier.name}: ${error.message}`);
        }
  
        // Use only the fileId for metadataCid
        const metadataFileId = metadataResult.fileId;
        metadataUrls.push(metadataFileId);
        console.log(`Metadata File ID for tier ${tier.name}: ${metadataFileId}`);
      }
  
      console.log('Final metadataUrls:', metadataUrls);
      if (new Set(metadataUrls).size !== metadataUrls.length) {
        throw new Error('Duplicate metadata file IDs detected in final array');
      }
      return metadataUrls;
    } catch (error) {
      console.error('Error generating tier metadata:', error);
      toast.error(`Failed to generate metadata: ${error.message}`);
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateStep(2)) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (Number(formData.price) <= 0) {
      toast.error('Price must be greater than 0 LYX');
      return;
    }

    const imageFiles = formData.tiers.map((tier) => tier.image);
    const uniqueImageNames = new Set(imageFiles.map((file) => file?.name));
    if (uniqueImageNames.size !== imageFiles.length) {
      toast.error('Each tier must have a unique image');
      return;
    }

    try {
      setLoading(true);
      toast.loading('Preparing NFT data...', { id: 'create-nft' });

      const metadataUrls = await generateTierMetadata();

      if (metadataUrls.length !== 3) {
        throw new Error('Expected 3 metadata URLs, got ' + metadataUrls.length);
      }

      const likesRequired = formData.tiers.map((tier) => tier.likesRequired);
      const commentsRequired = formData.tiers.map((tier) => tier.commentsRequired);
      const lyxStakeRequired = formData.tiers.map((tier) =>
        parseUnits(tier.lyxStakeRequired.toString(), 18)
      );
      const price = parseUnits(formData.price.toString(), 18);

      console.log('Contract args:', {
        likesRequired,
        commentsRequired,
        lyxStakeRequired,
        metadataUrls,
        price,
      });

      toast.loading('Creating NFT...', { id: 'create-nft' });

      const tx = await writeContractAsync({
        address: address,
        abi: artGridStudioABI,
        functionName: 'mintNFT',
        args: [likesRequired, commentsRequired, lyxStakeRequired, metadataUrls, price],
        gas: BigInt(5000000),
      });

      toast.loading('Transaction pending...', { id: 'create-nft' });

      const receipt = await waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== 'success') {
        throw new Error('Transaction failed');
      }

      toast.success('NFT created successfully!', { id: 'create-nft', duration: 5000 });

      // Show success animation
      document.querySelector('.success-animation').classList.add('show');

      // Reset form after delay
      setTimeout(() => {
        setFormData({
          name: '',
          description: '',
          price: '0.5',
          tiers: [
            {
              likesRequired: 10,
              commentsRequired: 5,
              lyxStakeRequired: 0.1,
              name: 'Bronze',
              description: 'Entry tier with basic perks',
              image: null,
            },
            {
              likesRequired: 20,
              commentsRequired: 10,
              lyxStakeRequired: 0.5,
              name: 'Silver',
              description: 'Enhanced tier with additional benefits',
              image: null,
            },
            {
              likesRequired: 50,
              commentsRequired: 20,
              lyxStakeRequired: 1,
              name: 'Gold',
              description: 'Premium tier with exclusive rewards',
              image: null,
            },
          ],
        });
        setPreviewUrls(['', '', '']);
        setCurrentStep(1);
        document.querySelector('.success-animation').classList.remove('show');

        if (onSuccess) onSuccess();
      }, 3000);
    } catch (error) {
      toast.dismiss();
      const reason = error.reason || error.message || 'Unknown error';
      if (reason.includes('403')) {
        toast.error('Failed to upload to Google Drive: Insufficient permissions');
      } else if (reason.includes('401')) {
        toast.error('Failed to upload: Invalid backend authentication');
      } else if (reason.includes('429')) {
        toast.error('Google Drive API rate limit exceeded. Please try again later.');
      } else if (reason.includes('Transaction failed')) {
        toast.error('Blockchain transaction failed. Please try again.');
      } else {
        toast.error(`Failed to create NFT: ${reason}`);
      }
      console.error('Create NFT error:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Render form steps
  const renderFormStep = () => {
    switch(currentStep) {
      case 1:
        return (
          <div className="form-step">
            <h3 className="step-title">Basic Information</h3>
            <div className="form-group">
              <label htmlFor="name">NFT Collection Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                maxLength={100}
                placeholder="Enter a captivating name for your NFT collection"
                className={formErrors.name ? 'error' : ''}
              />
              {formErrors.name && <div className="error-message"><AlertCircle size={16} /> {formErrors.name}</div>}
            </div>
            <div className="form-group">
              <label htmlFor="description">Collection Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                required
                maxLength={500}
                placeholder="Describe your NFT collection and its unique value proposition"
                className={formErrors.description ? 'error' : ''}
              ></textarea>
              {formErrors.description && <div className="error-message"><AlertCircle size={16} /> {formErrors.description}</div>}
              <div className="char-counter">{formData.description.length}/500</div>
            </div>
            <div className="form-group">
              <label htmlFor="price">Base Price (LYX)</label>
              <div className="input-with-icon">
                <input
                  type="number"
                  id="price"
                  name="price"
                  min="0.01"
                  step="0.01"
                  value={formData.price}
                  onChange={handleInputChange}
                  required
                  placeholder="Set the base price for your NFT"
                  className={formErrors.price ? 'error' : ''}
                />
                <span className="currency-label">LYX</span>
              </div>
              {formErrors.price && <div className="error-message"><AlertCircle size={16} /> {formErrors.price}</div>}
            </div>
            <div className="form-actions">
              <button type="button" className="next-button" onClick={nextStep} disabled={loading}>
                Continue to Tier Setup <ArrowRight size={18} />
              </button>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="form-step">
            <h3 className="step-title">Tier Configuration</h3>
            <p className="tier-instruction">Configure the three tiers for your NFT collection. Each tier should have unique requirements and benefits.</p>
            
            <div className="tiers-container">
              {formData.tiers.map((tier, index) => (
                <TierCard
                  key={index}
                  tier={tier}
                  index={index}
                  handleTierChange={handleTierChange}
                  handleImageChange={handleImageChange}
                  previewUrls={previewUrls}
                />
              ))}
              {Object.keys(formErrors).some(key => key.startsWith('tier')) && (
                <div className="tier-error-summary">
                  <AlertCircle size={18} /> Please fix the errors in your tier configuration
                </div>
              )}
            </div>
            
            <div className="form-actions">
              <button type="button" className="back-button" onClick={prevStep} disabled={loading}>
                Back
              </button>
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="spinner" size={20} />
                    Creating NFT...
                  </>
                ) : (
                  <>
                    Create NFT <Upload size={20} />
                  </>
                )}
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="create-nft-container">
      <div className="create-nft">
        <div className="form-header">
          <div className="step-indicator">
            <div className={`step ${currentStep >= 1 ? 'active' : ''}`}>
              <div className="step-number">{currentStep > 1 ? <Check size={16} /> : 1}</div>
              <div className="step-label">Basic Info</div>
            </div>
            <div className="step-connector"></div>
            <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>
              <div className="step-number">2</div>
              <div className="step-label">Tier Setup</div>
            </div>
          </div>
          <h2>Create Your NFT Collection</h2>
          <p className="form-subtitle">Design a multi-tiered NFT with engagement-based unlockable content</p>
        </div>
        
        <form onSubmit={handleSubmit} className="create-form">
          {renderFormStep()}
        </form>
        
        <div className="success-animation">
          <div className="success-icon">
            <Check size={48} />
          </div>
          <h3>NFT Created Successfully!</h3>
          <p>Your multi-tiered NFT has been minted to the blockchain</p>
        </div>
      </div>
    </div>
  );
};

export default CreateNFT;
import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import toast from 'react-hot-toast';
import './CreateNFT.css';
import artGridStudioABI from '../../abis/ArtGridStudio.json';

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
        description: 'Entry tier',
        image: null,
      },
      {
        likesRequired: 20,
        commentsRequired: 10,
        lyxStakeRequired: 0.5,
        name: 'Silver',
        description: 'Intermediate tier',
        image: null,
      },
      {
        likesRequired: 50,
        commentsRequired: 20,
        lyxStakeRequired: 1,
        name: 'Gold',
        description: 'Top tier',
        image: null,
      },
    ],
  });

  const [loading, setLoading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState(['', '', '']);

  const { writeContractAsync } = useWriteContract();
  const { waitForTransactionReceipt } = useWaitForTransactionReceipt();

  const handleImageChange = (e, tierIndex) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size exceeds 10MB limit');
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error('Please upload a valid image file');
        return;
      }
      console.log(`Selected image for tier ${tierIndex} (${formData.tiers[tierIndex].name}):`, file.name, file.size);
      const updatedTiers = [...formData.tiers];
      updatedTiers[tierIndex] = { ...updatedTiers[tierIndex], image: file };
      setFormData({ ...formData, tiers: updatedTiers });

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
  };

  const uploadToPinata = async (fileOrJson, isJson = false) => {
    const retryCount = 3;
    const baseDelay = 2000;
    const workerUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8787';

    if (!fileOrJson) {
      throw new Error('No file or JSON provided');
    }
    if (!isJson && !(fileOrJson instanceof File)) {
      throw new Error('Invalid file type');
    }
    if (isJson && typeof fileOrJson !== 'object') {
      throw new Error('Invalid JSON data');
    }

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const endpoint = isJson ? '/upload-json' : '/upload-file';
        const response = await fetch(`${workerUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SERVER_API_KEY}`,
            ...(isJson ? { 'Content-Type': 'application/json' } : {}),
          },
          body: isJson
            ? JSON.stringify(fileOrJson)
            : (() => {
                const formData = new FormData();
                formData.append('file', fileOrJson);
                return formData;
              })(),
        });

        if (!response.ok) {
          throw new Error(`Server-side upload failed with status: ${response.status}`);
        }

        const result = await response.json();
        console.log(`Attempt ${attempt}: Server-side upload response`, result);

        const cid = result.cid;
        if (cid && (cid.startsWith('baf') || cid.startsWith('Qm'))) {
          console.log(`Uploaded ${isJson ? 'JSON' : 'file'} to Pinata, CID: ${cid}`);
          return cid;
        } else {
          throw new Error(result.error || `Invalid CID: ${JSON.stringify(result)}`);
        }
      } catch (error) {
        console.error(`Upload attempt ${attempt} failed:`, error);
        if (attempt === retryCount) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
      }
    }
  };

  const generateTierMetadata = async () => {
    try {
      const metadataCids = [];
      const uploadedImageCids = new Set(); // Track unique image CIDs

      for (let i = 0; i < formData.tiers.length; i++) {
        const tier = formData.tiers[i];
        let imageCid = null;
        if (tier.image) {
          console.log(`Uploading image for tier ${tier.name}:`, tier.image.name);
          imageCid = await uploadToPinata(tier.image);
          console.log(`Tier ${tier.name} Image CID:`, imageCid);
          if (!imageCid.startsWith('baf') && !imageCid.startsWith('Qm')) {
            throw new Error(`Invalid image CID for tier ${tier.name}: ${imageCid}`);
          }
          if (uploadedImageCids.has(imageCid)) {
            throw new Error(`Duplicate image CID detected for tier ${tier.name}: ${imageCid}`);
          }
          uploadedImageCids.add(imageCid);
        } else {
          throw new Error(`No image provided for tier ${tier.name}`);
        }

        const metadata = {
          name: `${formData.name} - ${tier.name}`,
          description: `${formData.description} - ${tier.description}`,
          tier: tier.name,
          image: imageCid ? `ipfs://${imageCid}` : null,
        };

        console.log(`Generated metadata for tier ${tier.name}:`, metadata);
        const metadataCid = await uploadToPinata(metadata, true);
        console.log(`Tier ${tier.name} - Metadata CID: ${metadataCid}`);
        if (!metadataCid.startsWith('baf') && !metadataCid.startsWith('Qm')) {
          throw new Error(`Invalid metadata CID for tier ${tier.name}: ${metadataCid}`);
        }
        metadataCids.push(metadataCid);
      }

      console.log('Final metadataCids:', metadataCids);
      return metadataCids;
    } catch (error) {
      console.error('Error generating metadata:', error);
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.description || formData.tiers.some((tier) => !tier.image) || !formData.price) {
      toast.error('Please fill in all required fields, including price and images for each tier');
      return;
    }

    if (Number(formData.price) <= 0) {
      toast.error('Price must be greater than 0 LYX');
      return;
    }

    // Validate unique images
    const imageFiles = formData.tiers.map((tier) => tier.image);
    const uniqueImageNames = new Set(imageFiles.map((file) => file?.name));
    if (uniqueImageNames.size !== imageFiles.length) {
      toast.error('Each tier must have a unique image');
      return;
    }

    try {
      setLoading(true);
      toast.loading('Preparing NFT data...');

      const metadataCids = await generateTierMetadata();

      if (metadataCids.length !== 3) {
        throw new Error('Expected 3 metadata CIDs, got ' + metadataCids.length);
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
        metadataCids,
        price,
      });

      toast.dismiss();
      toast.loading('Creating NFT...');

      const tx = await writeContractAsync({
        address,
        abi: artGridStudioABI,
        functionName: 'mintNFT',
        args: [likesRequired, commentsRequired, lyxStakeRequired, metadataCids, price],
        gas: BigInt(6000000),
      });

      toast.dismiss();
      toast.loading('Transaction pending...');

      const receipt = await waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== 'success') {
        throw new Error('Transaction failed');
      }

      toast.dismiss();
      toast.success('NFT created successfully!');

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
            description: 'Entry tier',
            image: null,
          },
          {
            likesRequired: 20,
            commentsRequired: 10,
            lyxStakeRequired: 0.5,
            name: 'Silver',
            description: 'Intermediate tier',
            image: null,
          },
          {
            likesRequired: 50,
            commentsRequired: 20,
            lyxStakeRequired: 1,
            name: 'Gold',
            description: 'Top tier',
            image: null,
          },
        ],
      });
      setPreviewUrls(['', '', '']);

      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 2000);
    } catch (error) {
      toast.dismiss();
      const reason = error.reason || error.message || 'Unknown error';
      toast.error(`Failed to create NFT: ${reason}`);
      console.error('Create NFT error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-nft">
      <h2>Create New NFT</h2>
      <form onSubmit={handleSubmit} className="create-form">
        <div className="form-group">
          <label htmlFor="name">NFT Name</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
            maxLength={100}
          />
        </div>
        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            required
            maxLength={500}
          ></textarea>
        </div>
        <div className="form-group">
          <label htmlFor="price">Price (LYX)</label>
          <input
            type="number"
            id="price"
            name="price"
            min="0.01"
            step="0.01"
            value={formData.price}
            onChange={handleInputChange}
            required
          />
        </div>
        <div className="tiers-section">
          <h3>NFT Tiers</h3>
          {formData.tiers.map((tier, index) => (
            <div key={index} className="tier-form">
              <h4>{tier.name} Tier</h4>
              <div className="form-group">
                <label htmlFor={`tier-image-${index}`}>Tier Image</label>
                <input
                  type="file"
                  id={`tier-image-${index}`}
                  accept="image/*"
                  onChange={(e) => handleImageChange(e, index)}
                  required
                />
                {previewUrls[index] && (
                  <div className="image-preview">
                    <img src={previewUrls[index]} alt={`${tier.name} Preview`} />
                  </div>
                )}
              </div>
              <div className="tier-inputs">
                <div className="form-group">
                  <label>Likes Required</label>
                  <input
                    type="number"
                    min="0"
                    value={tier.likesRequired}
                    onChange={(e) => handleTierChange(index, 'likesRequired', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Comments Required</label>
                  <input
                    type="number"
                    min="0"
                    value={tier.commentsRequired}
                    onChange={(e) => handleTierChange(index, 'commentsRequired', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
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
              <div className="form-group">
                <label>Tier Description</label>
                <input
                  type="text"
                  value={tier.description}
                  onChange={(e) => handleTierChange(index, 'description', e.target.value)}
                  required
                />
              </div>
            </div>
          ))}
        </div>
        <button type="submit" className="submit-button" disabled={loading}>
          {loading ? 'Creating...' : 'Create NFT'}
        </button>
      </form>
    </div>
  );
};

export default CreateNFT;
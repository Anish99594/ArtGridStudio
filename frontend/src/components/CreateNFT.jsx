import React, { useState, useCallback } from 'react';
import { useWriteContract, usePublicClient } from 'wagmi';
import { parseEther } from 'viem';
import toast from 'react-hot-toast';
import { SignJWT } from 'jose';
import artGridStudioABI from '../../abis/ArtGridStudio.json';
import './CreateNFT.css';

const CreateNFT = ({ address: contractAddress, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    image: null,
    tiers: [
      { likesRequired: 0, commentsRequired: 0, lyxStakeRequired: 0 },
      { likesRequired: 10, commentsRequired: 5, lyxStakeRequired: 1 },
      { likesRequired: 50, commentsRequired: 20, lyxStakeRequired: 5 },
    ],
    price: '',
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [metadataCids, setMetadataCids] = useState(['', '', '']);
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const backendUrl = 'https://artgridstudio.onrender.com';

  const generateJwt = useCallback(async () => {
    const sharedSecret = import.meta.env.VITE_SHARED_SECRET;
    if (!sharedSecret) {
      throw new Error('Shared secret not configured');
    }
    try {
      const secret = new TextEncoder().encode(sharedSecret);
      const jwt = await new SignJWT({ sub: 'nft-upload' })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('1h')
        .sign(secret);
      return jwt;
    } catch (error) {
      console.error('JWT generation failed:', error);
      throw error;
    }
  }, []);

  const uploadToDrive = async (file, metadata, tierIndex) => {
    try {
      const jwt = await generateJwt();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('metadata', JSON.stringify(metadata));

      const response = await fetch(`${backendUrl}/upload-to-drive`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${errorText}`);
      }

      const data = await response.json();
      return data.fileId;
    } catch (error) {
      console.error(`Failed to upload tier ${tierIndex} to Google Drive:`, error);
      throw error;
    }
  };

  const handleInputChange = (e, tierIndex = null, field = null) => {
    const { name, value } = e.target;
    if (tierIndex !== null && field) {
      setFormData((prev) => {
        const newTiers = [...prev.tiers];
        newTiers[tierIndex] = { ...newTiers[tierIndex], [field]: Number(value) || 0 };
        return { ...prev, tiers: newTiers };
      });
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Please upload an image file');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Image size must be less than 10MB');
        return;
      }
      setFormData((prev) => ({ ...prev, image: file }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.image) {
      toast.error('Please upload an image');
      return;
    }
    if (!formData.name.trim() || !formData.description.trim()) {
      toast.error('Name and description are required');
      return;
    }
    if (!formData.price || Number(formData.price) <= 0) {
      toast.error('Please enter a valid price');
      return;
    }

    setIsUploading(true);
    try {
      const newMetadataCids = ['', '', ''];
      for (let i = 0; i < formData.tiers.length; i++) {
        const metadata = {
          name: `${formData.name} - Tier ${i + 1}`,
          description: formData.description,
          image: formData.image,
          attributes: [
            { trait_type: 'Tier', value: i + 1 },
            { trait_type: 'Likes Required', value: formData.tiers[i].likesRequired },
            { trait_type: 'Comments Required', value: formData.tiers[i].commentsRequired },
            { trait_type: 'LYX Stake Required', value: formData.tiers[i].lyxStakeRequired },
          ],
        };

        toast.loading(`Uploading tier ${i + 1} metadata...`, {
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            borderLeft: '4px solid var(--primary)',
            borderRadius: 'var(--border-radius-sm)',
          },
        });

        const fileId = await uploadToDrive(formData.image, metadata, i);
        newMetadataCids[i] = fileId;
        toast.dismiss();
        toast.success(`Tier ${i + 1} metadata uploaded!`, {
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            borderLeft: '4px solid var(--success)',
            borderRadius: 'var(--border-radius-sm)',
          },
        });
      }

      setMetadataCids(newMetadataCids);
      setIsUploading(false);
      setIsMinting(true);

      toast.loading('Minting NFT...', {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--primary)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });

      const tiersData = formData.tiers.map((tier, index) => ({
        likesRequired: BigInt(tier.likesRequired),
        commentsRequired: BigInt(tier.commentsRequired),
        lyxStakeRequired: parseEther(tier.lyxStakeRequired.toString()),
        metadataCid: newMetadataCids[index],
      }));

      const tx = await writeContractAsync({
        address: contractAddress,
        abi: artGridStudioABI,
        functionName: 'createNFT',
        args: [tiersData, parseEther(formData.price)],
      });

      toast.dismiss();
      toast.loading('Transaction pending...', {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--warning)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      if (receipt.status === 'success') {
        toast.dismiss();
        toast.success('NFT minted successfully!', {
          icon: '🎨',
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            borderLeft: '4px solid var(--success)',
            borderRadius: 'var(--border-radius-sm)',
          },
        });
        setFormData({
          name: '',
          description: '',
          image: null,
          tiers: [
            { likesRequired: 0, commentsRequired: 0, lyxStakeRequired: 0 },
            { likesRequired: 10, commentsRequired: 5, lyxStakeRequired: 1 },
            { likesRequired: 50, commentsRequired: 20, lyxStakeRequired: 5 },
          ],
          price: '',
        });
        setMetadataCids(['', '', '']);
        if (onSuccess) onSuccess();
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      toast.dismiss();
      console.error('Failed to create NFT:', error);
      const reason = error.reason || error.message || 'Unknown error';
      toast.error(`Failed to create NFT: ${reason}`, {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--error)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });
    } finally {
      setIsUploading(false);
      setIsMinting(false);
    }
  };

  return (
    <div className="create-nft-container">
      <h2>Create Your NFT</h2>
      <form onSubmit={handleSubmit} className="create-nft-form">
        <div className="form-group">
          <label htmlFor="name">NFT Name</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="Enter NFT name"
            required
            disabled={isUploading || isMinting}
          />
        </div>
        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Describe your NFT"
            required
            disabled={isUploading || isMinting}
          />
        </div>
        <div className="form-group">
          <label htmlFor="image">NFT Image</label>
          <input
            type="file"
            id="image"
            accept="image/*"
            onChange={handleImageChange}
            required
            disabled={isUploading || isMinting}
          />
          {formData.image && (
            <div className="image-preview">
              <img
                src={URL.createObjectURL(formData.image)}
                alt="Preview"
                className="image-preview-img"
              />
            </div>
          )}
        </div>
        <div className="form-group">
          <label>Tier Requirements</label>
          {formData.tiers.map((tier, index) => (
            <div key={index} className="tier-group">
              <h4>Tier {index + 1}</h4>
              <div className="tier-inputs">
                <div className="tier-input">
                  <label>Likes Required</label>
                  <input
                    type="number"
                    value={tier.likesRequired}
                    onChange={(e) => handleInputChange(e, index, 'likesRequired')}
                    min="0"
                    disabled={isUploading || isMinting}
                  />
                </div>
                <div className="tier-input">
                  <label>Comments Required</label>
                  <input
                    type="number"
                    value={tier.commentsRequired}
                    onChange={(e) => handleInputChange(e, index, 'commentsRequired')}
                    min="0"
                    disabled={isUploading || isMinting}
                  />
                </div>
                <div className="tier-input">
                  <label>LYX Stake Required</label>
                  <input
                    type="number"
                    value={tier.lyxStakeRequired}
                    onChange={(e) => handleInputChange(e, index, 'lyxStakeRequired')}
                    min="0"
                    step="0.1"
                    disabled={isUploading || isMinting}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="form-group">
          <label htmlFor="price">Initial Price (LYX)</label>
          <input
            type="number"
            id="price"
            name="price"
            value={formData.price}
            onChange={handleInputChange}
            placeholder="Enter initial price in LYX"
            min="0"
            step="0.1"
            required
            disabled={isUploading || isMinting}
          />
        </div>
        <button
          type="submit"
          className="create-nft-button"
          disabled={isUploading || isMinting}
        >
          {isUploading ? 'Uploading...' : isMinting ? 'Minting...' : 'Create NFT'}
        </button>
      </form>
    </div>
  );
};

export default CreateNFT;
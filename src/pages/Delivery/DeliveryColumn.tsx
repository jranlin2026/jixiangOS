import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { useDroppable } from '@dnd-kit/core';
import type { Delivery } from '../../types/delivery';
import DeliveryCard from './DeliveryCard';

interface DeliveryColumnProps {
  stage: string;
  deliveries: Delivery[];
  productType: string;
  color: string;
}

const DeliveryColumn: React.FC<DeliveryColumnProps> = ({ stage, deliveries, productType, color }) => {
  // 使用 useDroppable 使整列成为放置目标，id 格式：stage-阶段名
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stage}`,
    data: {
      stage,
      productType,
    },
  });

  return (
    <Box sx={{ minWidth: 260, maxWidth: 280, flex: '0 0 260px' }}>
      <Paper
        ref={setNodeRef}
        elevation={0}
        sx={{
          bgcolor: isOver ? '#e3f2fd' : '#f8f9fa',
          border: isOver ? '2px dashed #2196F3' : '1px solid #e5e7eb',
          borderRadius: 2,
          overflow: 'hidden',
          transition: 'all 0.2s ease',
        }}
      >
        {/* 列标题 */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: `3px solid ${color}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
            {stage}
          </Typography>
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              bgcolor: color,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            {deliveries.length}
          </Box>
        </Box>

        {/* 卡片列表 — 同时也作为可放置区域 */}
        <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 100 }}>
          {deliveries.map((delivery) => (
            <DeliveryCard key={delivery.id} delivery={delivery} color={color} />
          ))}
          {deliveries.length === 0 && (
            <Typography variant="body2" sx={{ color: '#9ca3af', textAlign: 'center', py: 3 }}>
              暂无交付项
            </Typography>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default DeliveryColumn;

import React from 'react';
import { Box, Typography, Paper, Chip, LinearProgress } from '@mui/material';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Delivery } from '../../types/delivery';

interface DeliveryCardProps {
  delivery: Delivery;
  color: string;
  /** 是否为 DragOverlay 中的拖拽副本 */
  isDragging?: boolean;
}

const DeliveryCard: React.FC<DeliveryCardProps> = ({ delivery, color, isDragging = false }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging: isActuallyDragging,
  } = useDraggable({
    id: isDragging ? `${delivery.id}-overlay` : delivery.id,
    disabled: isDragging,
    data: {
      delivery,
      currentStage: delivery.currentStage,
    },
  });

  const style: React.CSSProperties = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : {};

  // 计算子任务进度
  const totalTasks = delivery.tasks?.length || 0;
  const completedTasks = delivery.tasks?.filter((t) => t.status === '已完成').length || 0;
  const taskProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      elevation={0}
      sx={{
        p: 1.5,
        border: '1px solid #e5e7eb',
        borderRadius: 2,
        cursor: 'grab',
        transition: 'all 0.2s',
        borderLeft: `4px solid ${color}`,
        opacity: isActuallyDragging ? 0.4 : 1,
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : 'none',
        '&:hover': {
          boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : '0 2px 8px rgba(0,0,0,0.08)',
          transform: isDragging ? undefined : 'translateY(-1px)',
        },
        '&:active': {
          cursor: 'grabbing',
        },
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600, color: '#1a1a2e', mb: 0.5 }}>
        {delivery.customerName}
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Chip
          label={delivery.productType}
          size="small"
          sx={{
            fontSize: '0.625rem',
            height: 20,
            bgcolor: `${color}18`,
            color,
            fontWeight: 600,
          }}
        />
        <Typography variant="caption" sx={{ color: '#9ca3af' }}>
          {delivery.owner}
        </Typography>
      </Box>
      {/* 子任务进度条 */}
      {totalTasks > 0 && (
        <Box sx={{ mt: 0.75 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: '0.625rem' }}>
              任务 {completedTasks}/{totalTasks}
            </Typography>
            <Typography variant="caption" sx={{ color: taskProgress === 100 ? '#4CAF50' : '#9ca3af', fontSize: '0.625rem' }}>
              {taskProgress}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={taskProgress}
            sx={{
              height: 4,
              borderRadius: 2,
              bgcolor: '#f0f0f0',
              '& .MuiLinearProgress-bar': {
                bgcolor: taskProgress === 100 ? '#4CAF50' : color,
                borderRadius: 2,
              },
            }}
          />
        </Box>
      )}
      <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block', mt: 0.5 }}>
        {delivery.orderNo}
      </Typography>
    </Paper>
  );
};

export default DeliveryCard;

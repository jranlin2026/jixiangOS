import React from 'react';
import { Box, Typography } from '@mui/material';

interface TimelineItem {
  id: string;
  date: string;
  title: string;
  description?: string;
  dotColor?: string;
}

interface TimelineProps {
  items: TimelineItem[];
}

const Timeline: React.FC<TimelineProps> = ({ items }) => {
  return (
    <Box sx={{ position: 'relative', pl: 3 }}>
      {items.map((item, idx) => (
        <Box key={item.id} sx={{ position: 'relative', pb: 2.5 }}>
          {/* 时间轴圆点 */}
          <Box
            sx={{
              position: 'absolute',
              left: -21,
              top: 4,
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: item.dotColor || (idx === 0 ? '#2196F3' : '#d1d5db'),
              border: '2px solid #fff',
              boxShadow: '0 0 0 2px #e5e7eb',
            }}
          />
          {/* 连线 */}
          {idx < items.length - 1 && (
            <Box
              sx={{
                position: 'absolute',
                left: -17,
                top: 14,
                width: 2,
                height: 'calc(100% - 4px)',
                bgcolor: '#e5e7eb',
              }}
            />
          )}
          {/* 内容 */}
          <Box>
            <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block', mb: 0.25 }}>
              {item.date}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 500, color: '#1a1a2e' }}>
              {item.title}
            </Typography>
            {item.description && (
              <Typography variant="body2" sx={{ color: '#6b7280' }}>
                {item.description}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
      {items.length === 0 && (
        <Typography variant="body2" sx={{ color: '#9ca3af' }}>
          暂无记录
        </Typography>
      )}
    </Box>
  );
};

export default Timeline;

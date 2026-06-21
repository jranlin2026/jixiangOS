import React from 'react';
import { Box, Card, CardContent, Typography, Icon } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import ReceiptIcon from '@mui/icons-material/Receipt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import RefundIcon from '@mui/icons-material/MoneyOff';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PsychologyIcon from '@mui/icons-material/Psychology';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import { ROUTES } from '../../shared/utils/constants';

interface QuickActionItem {
  label: string;
  icon: React.ReactElement;
  path: string;
  color: string;
  bgColor: string;
}

const actions: QuickActionItem[] = [
  { label: '新增线索', icon: <PersonAddIcon />, path: ROUTES.LEADS, color: '#2196F3', bgColor: '#E3F2FD' },
  { label: '新增客户', icon: <GroupAddIcon />, path: ROUTES.CUSTOMERS, color: '#4CAF50', bgColor: '#E8F5E9' },
  { label: '新增订单', icon: <ReceiptIcon />, path: ROUTES.ORDERS, color: '#FF9800', bgColor: '#FFF3E0' },
  { label: '代理升级', icon: <TrendingUpIcon />, path: ROUTES.UPGRADE_ANALYSIS, color: '#9C27B0', bgColor: '#F3E5F5' },
  { label: '退款统计', icon: <RefundIcon />, path: ROUTES.ORDERS, color: '#F44336', bgColor: '#FFEBEE' },
  { label: '提成统计', icon: <AccountBalanceWalletIcon />, path: `${ROUTES.FINANCE}?tab=settlement`, color: '#00BCD4', bgColor: '#E0F7FA' },
  { label: '客户画像', icon: <PsychologyIcon />, path: ROUTES.CUSTOMERS, color: '#9C27B0', bgColor: '#F3E5F5' },
  { label: '经营分析', icon: <AnalyticsIcon />, path: ROUTES.FINANCE, color: '#FF9800', bgColor: '#FFF3E0' },
];

const QuickActions: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: '#1a1a2e' }}>
        快捷入口
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
        {actions.map((action) => (
          <Card
            key={action.label}
            elevation={0}
            sx={{
              cursor: 'pointer',
              transition: 'all 0.2s',
              border: '1px solid #f0f0f0',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              },
            }}
            onClick={() => navigate(action.path)}
          >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  bgcolor: action.bgColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 1.5,
                }}
              >
                <Icon sx={{ color: action.color, fontSize: 20 }}>{action.icon}</Icon>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 500, color: '#1a1a2e' }}>
                {action.label}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
};

export default QuickActions;

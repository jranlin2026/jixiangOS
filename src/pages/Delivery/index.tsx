import React, { useEffect, useState } from 'react';
import { Box, Typography, Tabs, Tab } from '@mui/material';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import useDeliveryStore from '../../store/useDeliveryStore';
import { deliveryApi, productApi } from '../../api';
import { DEFAULT_PRODUCT_LEVEL_CONFIGS } from '../../shared/utils/constants';
import DeliveryColumn from './DeliveryColumn';
import DeliveryCard from './DeliveryCard';
import type { Delivery, DeliveryProductType } from '../../types/delivery';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <Box sx={{ display: value === index ? 'block' : 'none' }}>
    {children}
  </Box>
);

interface ProductTabConfig {
  label: string;
  type: DeliveryProductType;
  color: string;
}

const Delivery: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [activeDelivery, setActiveDelivery] = useState<Delivery | null>(null);
  const [stageMap, setStageMap] = useState<Record<string, string[]>>({});
  const { items, loading, fetchByProductType, advanceStage } = useDeliveryStore();

  const fallbackProductTypes: ProductTabConfig[] = DEFAULT_PRODUCT_LEVEL_CONFIGS.map((level) => ({
    label: level.name.endsWith('产品') ? level.name : `${level.name}产品`,
    type: level.name,
    color: level.color,
  }));
  const [productTypes, setProductTypes] = useState<ProductTabConfig[]>(fallbackProductTypes);

  useEffect(() => {
    const loadProductTabs = async () => {
      const [productsRes, levelsRes] = await Promise.all([
        productApi.getAllProducts(),
        productApi.getProductLevelConfigs(),
      ]);
      if (levelsRes.code !== 0) return;
      const levelsWithProducts = new Set(
        productsRes.code === 0 ? productsRes.data.filter((product) => product.isActive).map((product) => product.level) : [],
      );
      const next = levelsRes.data
        .filter((level) => level.isActive || levelsWithProducts.has(level.name))
        .map((level) => ({
          label: level.name.endsWith('产品') ? level.name : `${level.name}产品`,
          type: level.name,
          color: level.color,
        }));
      if (next.length) {
        setProductTypes(next);
        setTabValue((current) => Math.min(current, next.length - 1));
      }
    };
    loadProductTabs();
  }, []);

  useEffect(() => {
    const productType = productTypes[tabValue]?.type;
    if (!productType) return;
    setActiveDelivery(null);
    const load = async () => {
      const [stagesRes] = await Promise.all([
        deliveryApi.fetchDeliveryStagesByProductType(productType),
        fetchByProductType(productType),
      ]);
      if (stagesRes.code === 0) {
        setStageMap((prev) => ({ ...prev, [productType]: stagesRes.data }));
      }
    };
    load();
  }, [tabValue, productTypes]);

  const currentConfig = productTypes[tabValue] || productTypes[0];
  const currentStages = stageMap[currentConfig.type]?.length
    ? stageMap[currentConfig.type]
    : Array.from(new Set(items.flatMap((item) => item.stages)));

  // 按阶段分组
  const groupedByStage = currentStages.map((stage) => ({
    stage,
    deliveries: items.filter((d) => d.currentStage === stage),
  }));

  // dnd-kit 传感器配置：需要拖拽超过 8px 才触发，避免点击误触
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  /** 拖拽开始：记录当前拖拽的交付项 */
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const delivery = items.find((d) => d.id === active.id);
    if (delivery) {
      setActiveDelivery(delivery);
    }
  };

  /** 拖拽结束：将交付项移动到目标阶段 */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDelivery(null);

    if (!over || !active) return;

    const deliveryId = String(active.id);
    const overId = String(over.id);
    let targetStage: string | null = null;

    // 检查是否拖到了某个阶段列上
    if (overId.startsWith('stage-')) {
      targetStage = overId.replace('stage-', '');
    } else {
      // 拖到了另一个卡片上，找到该卡片所在的阶段
      const overDelivery = items.find((d) => d.id === overId);
      if (overDelivery) {
        targetStage = overDelivery.currentStage;
      }
    }

    if (targetStage) {
      const currentDelivery = items.find((d) => d.id === deliveryId);
      // 仅当阶段发生变化时才调用 advanceStage
      if (currentDelivery && currentDelivery.currentStage !== targetStage) {
        advanceStage(deliveryId, targetStage);
      }
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
        交付中心
      </Typography>

      <Tabs
        value={tabValue}
        onChange={(_, v) => setTabValue(v)}
        sx={{ mb: 3, borderBottom: '1px solid #e5e7eb' }}
      >
        {productTypes.map((pt) => (
          <Tab key={pt.type} label={pt.label} />
        ))}
      </Tabs>

      {productTypes.map((pt, idx) => (
        <TabPanel key={pt.type} value={tabValue} index={idx}>
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2 }}>
              {groupedByStage.map((group) => (
                <DeliveryColumn
                  key={group.stage}
                  stage={group.stage}
                  deliveries={group.deliveries}
                  productType={pt.type}
                  color={pt.color}
                />
              ))}
            </Box>
            {/* 拖拽浮层：跟随鼠标的半透明卡片副本 */}
            <DragOverlay dropAnimation={null}>
              {activeDelivery ? (
                <DeliveryCard
                  delivery={activeDelivery}
                  color={currentConfig.color}
                  isDragging
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </TabPanel>
      ))}
    </Box>
  );
};

export default Delivery;

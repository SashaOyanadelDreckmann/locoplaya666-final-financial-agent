'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface AnimatedChatBubbleProps {
  content: ReactNode;
  role: 'user' | 'assistant';
  index: number;
  isLoading?: boolean;
}

/**
 * Chat bubble with elegant slide-in animations
 * Features:
 * - Slide from left (assistant) or right (user)
 * - Staggered entrance for conversation flow
 * - Loading state with typing indicators
 * - Smooth transitions
 */
export function AnimatedChatBubble({
  content,
  role,
  index,
  isLoading = false,
}: AnimatedChatBubbleProps) {
  const isUser = role === 'user';

  return (
    <motion.div
      className={`chat-bubble chat-bubble-${role}`}
      initial={{
        opacity: 0,
        x: isUser ? 20 : -20,
        y: 10,
      }}
      animate={{
        opacity: 1,
        x: 0,
        y: 0,
      }}
      transition={{
        duration: 0.4,
        delay: index * 0.05, // Stagger each message slightly
        ease: [0.34, 1.56, 0.64, 1],
      }}
      whileHover={{
        scale: 1.01,
        transition: { duration: 0.2 },
      }}
    >
      {isLoading ? (
        <div className="typing-indicator">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      ) : (
        content
      )}
    </motion.div>
  );
}

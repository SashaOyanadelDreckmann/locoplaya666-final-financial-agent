# 🎨 Premium Animation & Effects Guide

This guide covers all the special effects, animations, and premium interactions added to the Financiera Mente platform.

## 📦 New Dependencies

```bash
pnpm add framer-motion
```

## 🎬 Key Animation Files

- `app/animations.css` - 50+ keyframe animations and utility classes
- `components/AnimatedPanelCard.tsx` - Enhanced card with hover lift & glow
- `components/AnimatedChatBubble.tsx` - Chat messages with smooth entrance
- `components/AnimatedModal.tsx` - Premium modal with backdrop blur
- `components/AnimatedButton.tsx` - Buttons with ripple & shimmer effects
- `components/AnimatedSkeleton.tsx` - Loading states with pulse animation
- `components/InfiniteScrollPanel.tsx` - Auto-scroll mobile panel (NEW!)
- `components/StaggerContainer.tsx` - List animations with stagger effect
- `lib/hooks/useScrollAnimation.ts` - Scroll trigger hooks

---

## 🚀 Quick Start Examples

### 1. **Animated Panel Card** (Replaces PanelCard)

```tsx
import { AnimatedPanelCard } from '@/components/AnimatedPanelCard';

// Use instead of regular PanelCard for hover lift + glow effects
<AnimatedPanelCard
  label="Total Balance"
  value="$12,345"
  delay={0.1}
  hoverable={true}
>
  <p>Additional content</p>
</AnimatedPanelCard>
```

**Features:**
- ✨ Smooth scale + Y translation on hover
- 🌟 Glow shadow effect
- 📊 GPU accelerated (will-change: transform)
- 🎯 Staggered entrance animations

---

### 2. **Infinite Auto-Scroll Panel** (Mobile Feature)

```tsx
import { InfiniteScrollPanel } from '@/components/InfiniteScrollPanel';

// Mobile panel that auto-scrolls while users can still manually drag
<InfiniteScrollPanel
  autoScrollSpeed={40} // pixels per second
  pauseOnHover={true}  // Stop scrolling when user hovers
  enableAutoScroll={true}
>
  {/* Your panel cards here */}
  {panelCards.map(card => (
    <div key={card.id} className="min-w-max">
      <AnimatedPanelCard {...card} />
    </div>
  ))}
</InfiniteScrollPanel>
```

**Features:**
- ✨ Smooth auto-scroll showing all cards
- 👆 User can still drag/swipe manually
- ⏸️ Pauses on hover/interaction
- 📱 Touch-optimized with smooth scrolling

---

### 3. **Chat Bubbles with Animation**

```tsx
import { AnimatedChatBubble } from '@/components/AnimatedChatBubble';

{messages.map((msg, idx) => (
  <AnimatedChatBubble
    key={msg.id}
    content={msg.content}
    role={msg.role}
    index={idx}
    isLoading={msg.loading}
  />
))}
```

**Features:**
- 💬 Slide in from left (assistant) or right (user)
- 📊 Staggered entrance (each message delays by 50ms)
- ✍️ Typing indicator with bouncing dots
- 🎯 Smooth hover scale

---

### 4. **Animated Buttons**

```tsx
import { AnimatedButton } from '@/components/AnimatedButton';

<AnimatedButton
  variant="primary"
  size="md"
  onClick={handleClick}
  loading={isLoading}
>
  Send Message
</AnimatedButton>
```

**Variants:** primary, secondary, ghost, danger  
**Sizes:** sm, md, lg

**Features:**
- 🎨 Shimmer effect on hover
- 📌 Lift animation (transform: translateY)
- ⚙️ Loading spinner state
- ♿ Accessible (disabled state)

---

### 5. **Loading States**

```tsx
import { AnimatedSkeleton, LoadingSpinner, TypingIndicator } from '@/components/AnimatedSkeleton';

// Skeleton placeholder
<AnimatedSkeleton 
  type="card"
  count={3}
  animated={true}
/>

// Spinner
<LoadingSpinner size="md" />

// Typing indicator
<TypingIndicator />
```

---

### 6. **Modal with Animations**

```tsx
import { AnimatedModal } from '@/components/AnimatedModal';

<AnimatedModal
  isOpen={isOpen}
  onClose={handleClose}
  title="Centered Modal"
  size="md"
  centered={true}
  blur={true}
>
  {/* Your content */}
</AnimatedModal>
```

**Features:**
- ✨ Smooth scale & fade entrance
- 🎨 Backdrop blur effect
- 🎯 Centered positioning (mobile-aware)
- 📱 Responsive sizing

---

### 7. **Stagger Animations for Lists**

```tsx
import { StaggerList } from '@/components/StaggerContainer';

<StaggerList
  direction="vertical"
  spacing="md"
  className="w-full"
>
  {items.map(item => (
    <div key={item.id}>{item.content}</div>
  ))}
</StaggerList>
```

---

## 🎨 CSS Animation Classes

### Entrance Animations

```tsx
<div className="animate-fade-in">Content</div>
<div className="animate-slide-in-left">Slides from left</div>
<div className="animate-slide-in-right">Slides from right</div>
<div className="animate-slide-in-top">Slides from top</div>
<div className="animate-slide-in-bottom">Slides from bottom</div>
<div className="animate-bounce-in">Bounces in</div>
```

### Continuous Animations

```tsx
<div className="animate-float">Floating effect</div>
<div className="animate-pulse">Gentle pulse</div>
<div className="animate-glow">Glow pulse</div>
<div className="animate-breathing">Breathing effect</div>
<div className="animate-spin">Full rotation</div>
```

### Delay Utilities

```tsx
<div className="animate-fade-in delay-100">100ms delay</div>
<div className="animate-fade-in delay-200">200ms delay</div>
<div className="animate-fade-in delay-300">300ms delay</div>
<!-- delay-400, delay-500 also available -->
```

---

## 🪝 Custom Animation Hooks

### useScrollAnimation (Scroll Trigger)

```tsx
import { useScrollAnimation } from '@/lib/hooks/useScrollAnimation';

export function Component() {
  const { ref, isVisible } = useScrollAnimation(0.1);

  return (
    <div
      ref={ref}
      className={isVisible ? 'animate-fade-in' : 'opacity-0'}
    >
      I animate when scrolled into view!
    </div>
  );
}
```

### useParallaxScroll

```tsx
import { useParallaxScroll } from '@/lib/hooks/useScrollAnimation';

export function Hero() {
  const offset = useParallaxScroll(0.5);

  return (
    <div style={{ transform: `translateY(${offset}px)` }}>
      Parallax element
    </div>
  );
}
```

### useMouseFollow

```tsx
import { useMouseFollow } from '@/lib/hooks/useScrollAnimation';

export function Interactive() {
  const { ref, position } = useMouseFollow();

  return (
    <div
      ref={ref}
      style={{
        background: `radial-gradient(200px circle at ${position.x}px ${position.y}px, rgba(111, 143, 166, 0.3), transparent)`,
      }}
    >
      Mouse follow glow effect
    </div>
  );
}
```

### useScrollDirection

```tsx
import { useScrollDirection } from '@/lib/hooks/useScrollAnimation';

export function Header() {
  const direction = useScrollDirection();
  // Returns: 'up' | 'down' | 'idle'

  return (
    <nav className={direction === 'down' ? 'hide-nav' : 'show-nav'}>
      {/* Navbar that hides on scroll down */}
    </nav>
  );
}
```

---

## 🌟 Special Effects Details

### Glassmorphism

All premium elements use glassmorphism:
- Backdrop blur: 20px (30px on hover)
- Semi-transparent background
- Subtle border with white opacity

```css
.glass-effect {
  backdrop-filter: blur(20px) saturate(1.3);
  -webkit-backdrop-filter: blur(20px) saturate(1.3);
  border: 1px solid rgba(255, 255, 255, 0.15);
}
```

### Glow Effects

Enhanced shadow glow for premium feel:

```css
.glow-on-hover:hover {
  box-shadow: 0 0 30px rgba(111, 143, 166, 0.4);
}
```

### Shimmer Effect

Horizontal light sweep on buttons:

```css
@keyframes shimmer {
  0% { background-position: -1000px 0; }
  100% { background-position: 1000px 0; }
}
```

---

## 📱 Mobile Optimizations

### Auto-Scroll Panel (Mobile)

The `InfiniteScrollPanel` component provides:
- Automatic smooth scrolling showing all cards
- Manual drag/swipe override capability
- Pause on hover
- Touch-optimized scrolling with `-webkit-overflow-scrolling: touch`

### Centered Modal on Mobile

Modals automatically center on mobile devices with:
- Viewport-width awareness
- Safe area insets support
- Backdrop blur on iOS

### Reduced Motion Support

All animations respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 🎯 Performance Tips

1. **Use GPU Acceleration**
   ```css
   .hardware-accelerate {
     will-change: transform;
     transform: translateZ(0);
     backface-visibility: hidden;
   }
   ```

2. **Use CSS animations for loops** (not JavaScript)
   ```css
   .animate-float {
     animation: float 3s ease-in-out infinite;
   }
   ```

3. **Limit simultaneous animations** on mobile
   ```css
   @media (max-width: 767px) {
     .panel-card {
       animation-duration: 0.4s; /* Reduce from 0.6s */
     }
   }
   ```

4. **Use `transition` for state changes**
   - Hovers
   - Focus
   - Disabled states

5. **Lazy load heavy animations**
   - Use `useScrollAnimation` for entrance effects
   - Don't animate off-screen elements

---

## 🔧 Customization

### Change animation timings in `globals.css`:

```css
:root {
  --transition:   0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-normal: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### Change color glows:

```css
:root {
  --shadow-glow: 0 0 20px rgba(42, 123, 176, 0.4);
  --shadow-glow-yellow: 0 0 20px rgba(212, 164, 32, 0.3);
}
```

---

## ✅ Integration Checklist

- [ ] Install Framer Motion: `pnpm add framer-motion`
- [ ] Import `animations.css` in `globals.css`
- [ ] Replace PanelCard with AnimatedPanelCard in agent/page.tsx
- [ ] Wrap mobile panel with InfiniteScrollPanel
- [ ] Use AnimatedButton instead of regular buttons
- [ ] Add AnimatedChatBubble to chat rendering
- [ ] Use AnimatedModal for dialogs
- [ ] Add scroll animation hooks where needed
- [ ] Test on mobile (iOS + Android)
- [ ] Verify accessibility (keyboard nav, reduced motion)
- [ ] Test performance on low-end devices

---

## 🐛 Troubleshooting

**Animations not working?**
- Check `animations.css` is imported
- Verify Framer Motion is installed
- Check console for errors

**Performance issues on mobile?**
- Reduce animation duration on mobile
- Use CSS animations instead of JS
- Check for GPU acceleration on animated elements

**Modal not centering?**
- Verify `centered={true}` prop
- Check mobile CSS for `.modal-content`
- Test on actual device (CSS media queries may differ)

**Auto-scroll not smooth?**
- Adjust `autoScrollSpeed` prop
- Check for JavaScript frame drops
- Verify `-webkit-overflow-scrolling: touch`

---

## 📚 References

- [Framer Motion Docs](https://www.framer.com/motion/)
- [CSS Animation Best Practices](https://web.dev/animations/)
- [Web Performance Tips](https://web.dev/performance/)

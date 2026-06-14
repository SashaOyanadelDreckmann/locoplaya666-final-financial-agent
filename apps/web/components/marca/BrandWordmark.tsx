type BrandWordmarkProps = {
  className?: string;
  financieraClassName?: string;
  menteClassName?: string;
};

export default function BrandWordmark({
  className,
  financieraClassName,
  menteClassName,
}: BrandWordmarkProps) {
  return (
    <span className={className}>
      <span className={financieraClassName}>
        <span className="brand-wordmark-initial">F</span>
        <span>inanciera</span>
      </span>
      <span className={menteClassName}>
        <span className="brand-wordmark-initial">m</span>
        <span>ente</span>
      </span>
    </span>
  );
}

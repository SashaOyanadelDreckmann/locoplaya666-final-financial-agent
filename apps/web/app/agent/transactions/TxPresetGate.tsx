'use client';

type Preset = {
  title: string;
  bank: string;
  template: string;
};

type TxPresetGateProps = {
  canAddMoreProducts: boolean;
  presets: readonly Preset[];
  onSelectPreset: (preset: Preset) => void;
  onCreateProduct: () => void;
};

export function TxPresetGate({ canAddMoreProducts, presets, onSelectPreset, onCreateProduct }: TxPresetGateProps) {
  return (
    <div className="tx-carousel-gate tx-preset-gate">
      <div className="tx-preset-shell">
        <p className="tx-preset-title">Agregar movimiento de:</p>
        <div className="tx-preset-grid">
          {presets.map((preset) => (
            <button
              key={preset.title}
              type="button"
              className="tx-preset-btn"
              onClick={() => onSelectPreset(preset)}
              disabled={!canAddMoreProducts}
            >
              {preset.title}
            </button>
          ))}
          <button
            type="button"
            className="tx-preset-btn tx-preset-btn-add"
            onClick={onCreateProduct}
            disabled={!canAddMoreProducts}
          >
            + Agregar otro producto
          </button>
        </div>
      </div>
    </div>
  );
}

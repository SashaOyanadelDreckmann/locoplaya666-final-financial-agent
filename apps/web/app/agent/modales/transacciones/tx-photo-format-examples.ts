export type TxPhotoFormatExample = {
  id: string;
  src: string;
  alt: string;
  caption: string;
};

export const TX_PHOTO_FORMAT_EXAMPLES: TxPhotoFormatExample[] = [
  {
    id: 'movimientos-1',
    src: '/transacciones/ejemplos-fotos/movimientos-ejemplo-1.png',
    alt: 'Ejemplo de captura con listado de movimientos agrupados por fecha',
    caption: 'Listado continuo por fecha',
  },
  {
    id: 'movimientos-2',
    src: '/transacciones/ejemplos-fotos/movimientos-ejemplo-2.png',
    alt: 'Ejemplo de captura con resumen de cargos y abonos del periodo',
    caption: 'Resumen + movimientos recientes',
  },
  {
    id: 'movimientos-3',
    src: '/transacciones/ejemplos-fotos/movimientos-ejemplo-3.png',
    alt: 'Ejemplo de captura con encabezado de movimientos no facturados',
    caption: 'Encabezado y continuidad',
  },
  {
    id: 'movimientos-4',
    src: '/transacciones/ejemplos-fotos/movimientos-ejemplo-4.png',
    alt: 'Ejemplo de captura con varios días de movimientos encadenados',
    caption: 'Varios días encadenados',
  },
];

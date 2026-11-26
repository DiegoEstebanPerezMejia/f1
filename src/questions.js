// Definición del cuestionario financiero. El frontend se genera a partir de esta estructura.
const QUESTIONS = [
  {
    group: 'Perfil de la empresa',
    fields: [
      { id: 'sector', label: 'Sector o giro', type: 'select', options: ['Comercio', 'Servicios', 'Manufactura', 'Alimentos y restaurantes', 'Tecnología', 'Construcción', 'Otro'] },
      { id: 'anios', label: 'Años de operación', type: 'number', min: 0 },
      { id: 'empleados', label: 'Número de empleados', type: 'number', min: 0 },
      { id: 'contabilidad', label: '¿Lleva contabilidad formal?', type: 'select', options: ['Sí', 'Parcial', 'No'] },
    ],
  },
  {
    group: 'Ventas e ingresos (en pesos)',
    fields: [
      { id: 'ventas_6m', label: 'Ventas mensuales de los últimos 6 meses (del más antiguo al más reciente, separadas por coma)', type: 'text', placeholder: '120000, 125000, 118000, 130000, 135000, 140000', help: 'Entre más meses incluya (hasta 24), mejor será la proyección.' },
      { id: 'crecimiento_esperado', label: 'Crecimiento anual esperado de ventas (%)', type: 'number' },
    ],
  },
  {
    group: 'Costos y gastos mensuales',
    fields: [
      { id: 'costos_variables_pct', label: 'Costos variables como % de las ventas (materia prima, comisiones, etc.)', type: 'number', min: 0, max: 100 },
      { id: 'costos_fijos', label: 'Gastos fijos mensuales (renta, nómina, servicios, etc.)', type: 'number', min: 0 },
    ],
  },
  {
    group: 'Liquidez y capital de trabajo',
    fields: [
      { id: 'efectivo', label: 'Efectivo disponible hoy (caja y bancos)', type: 'number', min: 0 },
      { id: 'cuentas_cobrar', label: 'Cuentas por cobrar (clientes)', type: 'number', min: 0 },
      { id: 'dias_cobro', label: 'Días promedio de cobro a clientes', type: 'number', min: 0 },
      { id: 'inventario', label: 'Valor del inventario', type: 'number', min: 0 },
      { id: 'cuentas_pagar', label: 'Cuentas por pagar (proveedores)', type: 'number', min: 0 },
      { id: 'dias_pago', label: 'Días promedio de pago a proveedores', type: 'number', min: 0 },
    ],
  },
  {
    group: 'Deuda',
    fields: [
      { id: 'deuda_total', label: 'Deuda total (préstamos, créditos, arrendamientos)', type: 'number', min: 0 },
      { id: 'pago_deuda_mensual', label: 'Pago mensual de deuda (capital + intereses)', type: 'number', min: 0 },
    ],
  },
  {
    group: 'Planes y contexto',
    fields: [
      { id: 'inversion_planeada', label: 'Inversión planeada próximos 12 meses (pesos, 0 si ninguna)', type: 'number', min: 0 },
      { id: 'preocupaciones', label: 'Principales preocupaciones o metas del negocio', type: 'textarea' },
    ],
  },
];

module.exports = { QUESTIONS };

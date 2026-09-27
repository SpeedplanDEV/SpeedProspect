/** Mapa do Google com o endereço da empresa (carrega só quando chega perto da tela) */
export function Mapa({ endereco, nome, className = '' }: { endereco: string; nome: string; className?: string }) {
  if (!endereco) return null;
  const q = encodeURIComponent(`${nome}, ${endereco}`);
  return (
    <iframe
      title={`Mapa de ${nome}`}
      src={`https://maps.google.com/maps?q=${q}&z=16&output=embed`}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      className={`w-full border-0 ${className}`}
    />
  );
}

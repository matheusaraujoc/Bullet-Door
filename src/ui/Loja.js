import { t, aoTrocarIdioma } from './i18n.js';
import { asset } from '../core/assets-url.js';
import { obterProgresso, estaDesbloqueado, comprarItem } from '../core/Progresso.js';
import { CATALOGO } from '../core/Catalogo.js';

/**
 * A loja — Fase 3 do Roadmap de Progressão. Gasta moeda permanente pra
 * desbloquear um item pra sempre no catálogo; usar de verdade numa corrida é
 * outra fase (a Fase 5, equipamento por partida). Aberta a partir do fim de
 * partida, pra sempre ter algo pra gastar logo depois de ganhar.
 */
export function criarLoja(aoFechar) {
  const overlay = document.getElementById('loja');
  const saldoEl = document.getElementById('lojaSaldo');
  const gradeEl = document.getElementById('lojaGrade');
  const btnFechar = document.getElementById('btnFecharLoja');
  if (!overlay || !gradeEl) return null;

  const pintar = () => {
    const p = obterProgresso();
    if (saldoEl) saldoEl.textContent = t('loja.saldo', { moedas: p.moedas });

    gradeEl.replaceChildren(...CATALOGO.map(item => {
      const dono = estaDesbloqueado(item.id);
      const el = document.createElement('div');
      el.className = dono ? 'loja-item dono' : 'loja-item';

      const img = document.createElement('img');
      img.src = asset(`models/BastlersKit/Previews/${item.id}.png`);
      img.alt = item.nome;
      img.loading = 'lazy';

      const nome = document.createElement('b');
      nome.textContent = item.nome;

      const btn = document.createElement('button');
      btn.type = 'button';
      if (dono) {
        btn.textContent = t('loja.desbloqueado');
        btn.disabled = true;
        btn.className = 'ghost';
      } else {
        btn.textContent = t('loja.comprarPor', { preco: item.preco });
        btn.disabled = p.moedas < item.preco;
        btn.addEventListener('click', () => {
          const r = comprarItem(item.id, item.preco);
          if (r.ok) pintar();
        });
      }

      el.append(img, nome, btn);
      return el;
    }));
  };

  btnFechar?.addEventListener('click', () => {
    overlay.classList.add('hidden');
    aoFechar?.();
  });

  // reaplica nomes/preços no idioma novo sempre que a loja estiver montada
  aoTrocarIdioma(() => { if (!overlay.classList.contains('hidden')) pintar(); });

  return {
    abrir() { pintar(); overlay.classList.remove('hidden'); },
    fechar() { overlay.classList.add('hidden'); },
  };
}

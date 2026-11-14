/* =====================================================================
 * SARE INEP — Acessibilidade para daltonismo
 * =====================================================================
 * Este arquivo adiciona à página um painel de acessibilidade com dois
 * recursos:
 *
 * 1) MODO DALTÔNICO
 *    Troca o verde/vermelho do gráfico por uma paleta segura para
 *    daltônicos (Okabe-Ito: azul e laranja) e aplica TEXTURAS nas barras
 *    usando a biblioteca Patternomaly. Assim a informação não depende só
 *    da cor (WCAG 2.2, critério 1.4.1 "Uso de cor").
 *
 * 2) SIMULADOR DE DALTONISMO
 *    Mostra a página como uma pessoa daltônica enxerga, com filtros de cor
 *    baseados no modelo de Machado, Oliveira e Fernandes (2009).
 *    Serve para demonstrar o problema e testar a solução.
 *
 * Bibliotecas usadas (carregadas no index.html):
 *    - Chart.js ...... desenha o gráfico (já fazia parte do projeto)
 *    - Patternomaly .. cria as texturas — github.com/ashiguruma/patternomaly
 *
 * O arquivo também deixa uma pequena API disponível no navegador:
 *    Daltonismo.ativarModo(true)        // ou false
 *    Daltonismo.simular('deuteranopia') // ou 'protanopia', 'tritanopia',
 *                                       //    'acromatopsia', 'normal'
 * ===================================================================== */
(function () {
    'use strict';

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES
    // -----------------------------------------------------------------

    // Paleta Okabe-Ito: as cores continuam diferentes entre si
    // para os principais tipos de daltonismo.
    const PALETA_SEGURA = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00'];

    // Uma textura da Patternomaly para cada série do gráfico
    // (1ª série: pontos, 2ª série: listras diagonais, ...).
    const TEXTURAS = ['dot', 'diagonal', 'cross', 'dash', 'zigzag', 'line-vertical'];

    // Matrizes de simulação (Machado et al., 2009, severidade máxima).
    // Cada matriz recalcula o vermelho, o verde e o azul de cada pixel
    // do jeito que uma pessoa com aquele tipo de daltonismo percebe.
    const SIMULACOES = {
        normal: {
            nome: 'Visão normal',
            descricao: 'Sem simulação',
            matriz: null
        },
        protanopia: {
            nome: 'Protanopia',
            descricao: 'Dificuldade com o vermelho',
            matriz: [0.152286, 1.052583, -0.204868,
                     0.114503, 0.786281, 0.099216,
                    -0.003882, -0.048116, 1.051998]
        },
        deuteranopia: {
            nome: 'Deuteranopia',
            descricao: 'Dificuldade com o verde',
            matriz: [0.367322, 0.860646, -0.227968,
                     0.280085, 0.672501, 0.047413,
                    -0.011820, 0.042940, 0.968881]
        },
        tritanopia: {
            nome: 'Tritanopia',
            descricao: 'Dificuldade com o azul',
            matriz: [1.255528, -0.076749, -0.178779,
                    -0.078411, 0.930809, 0.147602,
                     0.004733, 0.691367, 0.303900]
        },
        acromatopsia: {
            nome: 'Acromatopsia',
            descricao: 'Não enxerga cores',
            matriz: [0.2126, 0.7152, 0.0722,
                     0.2126, 0.7152, 0.0722,
                     0.2126, 0.7152, 0.0722]
        }
    };

    // Nome usado para lembrar a escolha do usuário no navegador
    const CHAVE_PREFERENCIA = 'sare-inep:modo-daltonico';

    const estado = {
        modoDaltonico: lerPreferencia(),
        simulacao: 'normal'
    };

    // -----------------------------------------------------------------
    // 2. MODO DALTÔNICO NO GRÁFICO (plugin do Chart.js)
    // -----------------------------------------------------------------
    // O Chart.js chama este plugin antes de cada atualização do gráfico.
    // Por isso não precisamos mexer no script.js: qualquer gráfico criado
    // na página passa por aqui e recebe as cores certas.

    const texturasCriadas = new Map(); // guarda as texturas para não recriar

    function criarTextura(nomeTextura, cor) {
        const chave = nomeTextura + '|' + cor;
        if (!texturasCriadas.has(chave)) {
            texturasCriadas.set(chave, window.pattern.draw(nomeTextura, cor));
        }
        return texturasCriadas.get(chave);
    }

    const pluginModoDaltonico = {
        id: 'modoDaltonico',
        beforeUpdate(grafico) {
            const patternomalyCarregada = window.pattern && typeof window.pattern.draw === 'function';

            grafico.data.datasets.forEach((serie, indice) => {
                // Na primeira vez, guarda a cor original para poder voltar depois
                if (!('_corOriginal' in serie)) {
                    serie._corOriginal = serie.backgroundColor;
                }

                if (!estado.modoDaltonico) {
                    serie.backgroundColor = serie._corOriginal;
                    return;
                }

                const cor = PALETA_SEGURA[indice % PALETA_SEGURA.length];
                const textura = TEXTURAS[indice % TEXTURAS.length];

                // Se a Patternomaly não carregou (sem internet), usa só a paleta segura
                serie.backgroundColor = patternomalyCarregada ? criarTextura(textura, cor) : cor;
            });
        }
    };

    let pluginRegistrado = false;

    function registrarPlugin() {
        if (pluginRegistrado || !window.Chart) return;
        window.Chart.register(pluginModoDaltonico);
        pluginRegistrado = true;
    }

    function redesenharGraficos() {
        if (!window.Chart || !window.Chart.instances) return;
        Object.values(window.Chart.instances).forEach((grafico) => grafico.update());
    }

    // -----------------------------------------------------------------
    // 3. SIMULADOR (filtros SVG aplicados à página inteira)
    // -----------------------------------------------------------------

    function criarFiltrosSvg() {
        let filtros = '';

        for (const [tipo, simulacao] of Object.entries(SIMULACOES)) {
            if (!simulacao.matriz) continue;
            const m = simulacao.matriz;
            // O feColorMatrix usa uma matriz 4x5 (vermelho, verde, azul, transparência)
            const valores = [
                m[0], m[1], m[2], 0, 0,
                m[3], m[4], m[5], 0, 0,
                m[6], m[7], m[8], 0, 0,
                0, 0, 0, 1, 0
            ].join(' ');
            filtros += `<filter id="a11y-filtro-${tipo}" color-interpolation-filters="linearRGB">` +
                       `<feColorMatrix type="matrix" values="${valores}"/></filter>`;
        }

        document.getElementById('a11y-raiz').insertAdjacentHTML('beforeend',
            `<svg class="a11y-svg" aria-hidden="true" focusable="false"><defs>${filtros}</defs></svg>`);
    }

    // -----------------------------------------------------------------
    // 4. PAINEL DE ACESSIBILIDADE (interface)
    // -----------------------------------------------------------------

    const ESTILOS = `
        #a11y-raiz, #a11y-raiz * { box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; }
        #a11y-raiz .a11y-svg { position: absolute; width: 0; height: 0; overflow: hidden; }

        #a11y-raiz .a11y-abrir {
            position: fixed; left: 20px; bottom: 20px; z-index: 9999;
            display: inline-flex; align-items: center; gap: 8px;
            width: auto; margin: 0; padding: 12px 18px;
            background: #1e3a8a; color: #fff; border: none; border-radius: 999px;
            font-size: 15px; font-weight: 600; cursor: pointer;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25); opacity: 1;
        }
        #a11y-raiz .a11y-abrir:hover { background: #1d4ed8; opacity: 1; }

        #a11y-raiz .a11y-painel {
            position: fixed; left: 20px; bottom: 80px; z-index: 9999;
            width: 320px; max-width: calc(100vw - 40px); max-height: calc(100vh - 110px); overflow-y: auto;
            background: #fff; color: #1f2937; border-radius: 12px; padding: 20px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        }
        #a11y-raiz .a11y-painel[hidden], #a11y-raiz .a11y-aviso[hidden] { display: none; }

        #a11y-raiz .a11y-cabecalho {
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 15px;
        }
        #a11y-raiz h2 { margin: 0; font-size: 1.2rem; color: #1e3a8a; }
        #a11y-raiz .a11y-fechar {
            width: 36px; height: 36px; margin: 0; padding: 0;
            background: transparent; color: #374151; border: none; border-radius: 6px;
            font-size: 24px; line-height: 1; cursor: pointer; opacity: 1;
        }
        #a11y-raiz .a11y-fechar:hover { background: #f3f4f6; opacity: 1; }

        #a11y-raiz .a11y-secao { margin: 0 0 18px; padding: 0; border: none; }
        #a11y-raiz legend { padding: 0; margin-bottom: 8px; font-weight: 600; font-size: 0.95rem; color: #374151; }
        #a11y-raiz small { display: block; font-size: 0.82rem; color: #4b5563; font-weight: 400; }

        /* Chave liga/desliga do modo daltônico */
        #a11y-raiz .a11y-chave { display: flex; align-items: center; gap: 12px; cursor: pointer; }
        #a11y-raiz .a11y-chave input { position: absolute; opacity: 0; width: 1px; height: 1px; }
        #a11y-raiz .a11y-trilho {
            flex-shrink: 0; position: relative; width: 46px; height: 26px;
            background: #6b7280; border-radius: 999px; transition: background 0.2s;
        }
        #a11y-raiz .a11y-trilho::after {
            content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px;
            background: #fff; border-radius: 50%; transition: transform 0.2s;
        }
        #a11y-raiz .a11y-chave input:checked + .a11y-trilho { background: #1d4ed8; }
        #a11y-raiz .a11y-chave input:checked + .a11y-trilho::after { transform: translateX(20px); }

        /* Opções do simulador */
        #a11y-raiz .a11y-opcao {
            display: flex; align-items: flex-start; gap: 10px;
            padding: 8px 10px; margin-bottom: 4px; border-radius: 8px; cursor: pointer;
        }
        #a11y-raiz .a11y-opcao:hover { background: #f3f4f6; }
        #a11y-raiz .a11y-opcao input { width: 18px; height: 18px; margin: 2px 0 0; accent-color: #1d4ed8; }
        #a11y-raiz .a11y-nota { margin: 8px 0 0; font-size: 0.8rem; color: #4b5563; }

        /* Faixa que avisa que a simulação está ligada */
        #a11y-raiz .a11y-aviso {
            position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 9999;
            display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center;
            max-width: calc(100vw - 24px); padding: 10px 16px;
            background: #1e3a8a; color: #fff; border-radius: 999px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25); font-size: 0.95rem;
        }
        #a11y-raiz .a11y-aviso button {
            width: auto; margin: 0; padding: 6px 14px;
            background: #fff; color: #1e3a8a; border: none; border-radius: 999px;
            font-size: 0.85rem; font-weight: 600; cursor: pointer; opacity: 1;
        }

        /* Contorno de foco bem visível para quem navega pelo teclado */
        #a11y-raiz button:focus-visible,
        #a11y-raiz .a11y-opcao input:focus-visible,
        #a11y-raiz .a11y-chave input:focus-visible + .a11y-trilho {
            outline: 3px solid #1d4ed8; outline-offset: 3px;
        }
        #a11y-raiz .a11y-aviso button:focus-visible { outline-color: #fff; }

        /* Texto lido só por leitores de tela */
        #a11y-raiz .a11y-somente-leitor {
            position: absolute; width: 1px; height: 1px; overflow: hidden;
            clip: rect(0 0 0 0); white-space: nowrap;
        }

        @media (prefers-reduced-motion: reduce) {
            #a11y-raiz .a11y-trilho, #a11y-raiz .a11y-trilho::after { transition: none; }
        }
    `;

    function criarPainel() {
        const estilo = document.createElement('style');
        estilo.textContent = ESTILOS;
        document.head.appendChild(estilo);

        const opcoesSimulador = Object.entries(SIMULACOES).map(([tipo, simulacao]) => `
            <label class="a11y-opcao">
                <input type="radio" name="a11y-simulacao" value="${tipo}" ${tipo === 'normal' ? 'checked' : ''}>
                <span><strong>${simulacao.nome}</strong><small>${simulacao.descricao}</small></span>
            </label>`).join('');

        const raiz = document.createElement('div');
        raiz.id = 'a11y-raiz';
        raiz.innerHTML = `
            <button type="button" class="a11y-abrir" aria-expanded="false" aria-controls="a11y-painel">
                <span aria-hidden="true">👁</span> Acessibilidade
            </button>

            <section id="a11y-painel" class="a11y-painel" aria-labelledby="a11y-titulo" hidden>
                <div class="a11y-cabecalho">
                    <h2 id="a11y-titulo">Acessibilidade</h2>
                    <button type="button" class="a11y-fechar" aria-label="Fechar painel de acessibilidade">×</button>
                </div>

                <div class="a11y-secao">
                    <label class="a11y-chave">
                        <input type="checkbox" role="switch" id="a11y-modo">
                        <span class="a11y-trilho" aria-hidden="true"></span>
                        <span><strong>Modo daltônico</strong><small>Cores seguras e texturas no gráfico</small></span>
                    </label>
                </div>

                <fieldset class="a11y-secao">
                    <legend>Simular como um daltônico enxerga</legend>
                    ${opcoesSimulador}
                    <p class="a11y-nota">A simulação é só para demonstração.</p>
                </fieldset>
            </section>

            <div class="a11y-aviso" hidden>
                <span>Simulando: <strong class="a11y-aviso-nome"></strong></span>
                <button type="button" class="a11y-parar">Parar simulação</button>
            </div>

            <p class="a11y-somente-leitor" role="status" aria-live="polite"></p>
        `;
        document.body.appendChild(raiz);

        const botaoAbrir = raiz.querySelector('.a11y-abrir');
        const painel = raiz.querySelector('.a11y-painel');

        function abrirOuFecharPainel(abrir) {
            painel.hidden = !abrir;
            botaoAbrir.setAttribute('aria-expanded', String(abrir));
            if (abrir) raiz.querySelector('#a11y-modo').focus();
        }

        botaoAbrir.addEventListener('click', () => abrirOuFecharPainel(painel.hidden));

        raiz.querySelector('.a11y-fechar').addEventListener('click', () => {
            abrirOuFecharPainel(false);
            botaoAbrir.focus();
        });

        // Tecla Esc fecha o painel e devolve o foco ao botão
        painel.addEventListener('keydown', (evento) => {
            if (evento.key === 'Escape') {
                abrirOuFecharPainel(false);
                botaoAbrir.focus();
            }
        });

        raiz.querySelector('#a11y-modo').addEventListener('change', (evento) => {
            ativarModo(evento.target.checked);
        });

        raiz.querySelectorAll('input[name="a11y-simulacao"]').forEach((opcao) => {
            opcao.addEventListener('change', () => simular(opcao.value));
        });

        raiz.querySelector('.a11y-parar').addEventListener('click', () => simular('normal'));

        raiz.querySelector('#a11y-modo').checked = estado.modoDaltonico;
    }

    // Avisa leitores de tela sobre a mudança
    function anunciar(mensagem) {
        const regiao = document.querySelector('#a11y-raiz [role="status"]');
        if (regiao) regiao.textContent = mensagem;
    }

    // -----------------------------------------------------------------
    // 5. AÇÕES (também disponíveis como API: window.Daltonismo)
    // -----------------------------------------------------------------

    function ativarModo(ativo) {
        estado.modoDaltonico = Boolean(ativo);
        salvarPreferencia(estado.modoDaltonico);

        const chave = document.getElementById('a11y-modo');
        if (chave) chave.checked = estado.modoDaltonico;

        redesenharGraficos();
        anunciar(estado.modoDaltonico
            ? 'Modo daltônico ativado. O gráfico agora usa azul e laranja, com texturas.'
            : 'Modo daltônico desativado. O gráfico voltou às cores originais.');
    }

    function simular(tipo) {
        if (!SIMULACOES[tipo]) tipo = 'normal';
        estado.simulacao = tipo;
        const simulacao = SIMULACOES[tipo];

        // O filtro vai no elemento <html>, então vale para a página inteira
        document.documentElement.style.filter = simulacao.matriz ? `url(#a11y-filtro-${tipo})` : '';

        const opcao = document.querySelector(`#a11y-raiz input[name="a11y-simulacao"][value="${tipo}"]`);
        if (opcao) opcao.checked = true;

        const aviso = document.querySelector('#a11y-raiz .a11y-aviso');
        if (aviso) {
            aviso.hidden = !simulacao.matriz;
            aviso.querySelector('.a11y-aviso-nome').textContent =
                `${simulacao.nome} (${simulacao.descricao.toLowerCase()})`;
        }

        anunciar(simulacao.matriz ? `Simulando ${simulacao.nome}.` : 'Simulação desligada.');
    }

    // -----------------------------------------------------------------
    // 6. PREFERÊNCIA SALVA NO NAVEGADOR
    // -----------------------------------------------------------------

    function lerPreferencia() {
        try {
            return localStorage.getItem(CHAVE_PREFERENCIA) === 'ligado';
        } catch (erro) {
            return false; // navegador bloqueou o armazenamento: segue sem lembrar
        }
    }

    function salvarPreferencia(ligado) {
        try {
            localStorage.setItem(CHAVE_PREFERENCIA, ligado ? 'ligado' : 'desligado');
        } catch (erro) {
            // Sem armazenamento disponível: a escolha vale só até recarregar a página
        }
    }

    // -----------------------------------------------------------------
    // 7. INICIALIZAÇÃO
    // -----------------------------------------------------------------

    function iniciar() {
        registrarPlugin();
        criarPainel();
        criarFiltrosSvg();
        if (estado.modoDaltonico) redesenharGraficos();
    }

    window.Daltonismo = { ativarModo, simular };

    registrarPlugin(); // registra já, para pegar o gráfico desde a primeira vez
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();

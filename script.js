const API_BASE = 'https://pokeapi.co/api/v2';

const randomBtn = document.getElementById('randomBtn');
const loadingEl = document.getElementById('loading');
const pokemonEl = document.getElementById('pokemon');
const pokemonImage = document.getElementById('pokemonImage');
const pokemonName = document.getElementById('pokemonName');
const pokemonId = document.getElementById('pokemonId');
const pokemonHeight = document.getElementById('pokemonHeight');
const pokemonWeight = document.getElementById('pokemonWeight');
const pokemonTypesEl = document.getElementById('pokemonTypes');

randomBtn.addEventListener('click', fetchRandomPokemon);

async function fetchRandomPokemon() {
    const pokemonId = Math.floor(Math.random() * 1025) + 1;
    await displayPokemon(pokemonId);
}

async function displayPokemon(id) {
    try {
        loadingEl.style.display = 'block';
        pokemonEl.style.display = 'none';

        const response = await fetch(`${API_BASE}/pokemon/${id}`);
        if (!response.ok) throw new Error('Failed to fetch pokemon');

        const data = await response.json();

        pokemonImage.src = data.sprites.other['official-artwork'].front_default || data.sprites.front_default;
        pokemonName.textContent = data.name;
        document.getElementById('pokemonId').textContent = data.id;
        document.getElementById('pokemonHeight').textContent = `${data.height / 10} m`;
        document.getElementById('pokemonWeight').textContent = `${data.weight / 10} kg`;

        pokemonTypesEl.innerHTML = data.types
            .map(type => `<span class="type-badge type-${type.type.name}">${type.type.name}</span>`)
            .join('');

        loadingEl.style.display = 'none';
        pokemonEl.style.display = 'block';
    } catch (error) {
        console.error('Error:', error);
        loadingEl.style.display = 'none';
        pokemonEl.innerHTML = '<p>ポケモンの読み込みに失敗しました</p>';
        pokemonEl.style.display = 'block';
    }
}

// 初期ロード
fetchRandomPokemon();

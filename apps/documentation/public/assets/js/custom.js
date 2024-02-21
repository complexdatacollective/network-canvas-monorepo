// Mobile menu toggle
const headerTrigger = document.querySelector('.header__menu-trigger');
const header = document.querySelector('.header');

if (headerTrigger) {
    headerTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        document.body.classList.toggle('has-open-nav');
    });
}

if (header) {
    document.addEventListener('click', (e) => {
        const isClickInside = header.contains(e.target);

        if (!isClickInside && document.body.classList.contains('has-open-nav')) {
            document.body.classList.remove('has-open-nav');
        }
    });
}

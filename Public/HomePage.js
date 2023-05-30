
for (let postNumber = 1; postNumber < 5; postNumber++) {
    new Splide("#splide" + postNumber).mount();
    document.querySelectorAll("button.post" + postNumber)[0].addEventListener("click", function () {
        document.querySelectorAll(".plannerPopup.post" + postNumber)[0].classList.toggle("open-planner-popup");
    }
    );

    document.querySelectorAll("button.post" + postNumber)[4].addEventListener("click", function () {
        document.querySelectorAll(".plannerPopup.post" + postNumber)[0].classList.toggle("open-planner-popup");
    }
    );
  
    document.querySelectorAll("button.post" + postNumber + " i")[0].addEventListener("click", function () {
        this.classList.toggle("fa-regular");
        this.classList.toggle("fa-solid");
    }
    );

    document.querySelectorAll("button.post" + postNumber + " i")[2].addEventListener("click", function () {
        this.classList.toggle("fa-regular");
        this.classList.toggle("fa-solid");
    }
    );

    document.querySelector(".plannerPopup")
};

import React from 'react'
import ReactDOM from 'react-dom/client'
import PetCat from './PetCat'
import './pet.css'

ReactDOM.createRoot(document.getElementById('pet-root')!).render(
  <React.StrictMode>
    <PetCat />
  </React.StrictMode>
)
